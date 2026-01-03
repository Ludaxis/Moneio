/**
 * Dashboard Service - Aggregated metrics with caching
 *
 * Uses React cache() for request-scoped deduplication.
 */

import { prisma } from '@moneio/db';
import { calculateRunway, getRunwayDescription, type MonthlySummary } from '@moneio/domain';

import type { DashboardMetricsDto, MoneyDto, MonthlyDataDto, TransactionSummaryDto } from './dto';

// React's cache() is only available in RSC context
// Provide a passthrough fallback for non-RSC environments (tests, etc.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cache: <T extends (...args: any[]) => any>(fn: T) => T;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  cache = require('react').cache;
} catch {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cache = <T extends (...args: any[]) => any>(fn: T): T => fn;
}
if (typeof cache !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cache = <T extends (...args: any[]) => any>(fn: T): T => fn;
}

/**
 * Get date range from period string
 */
function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];

  let startDate: string;

  switch (period) {
    case 'last7': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString().split('T')[0];
      break;
    }

    case 'last30':
    case 'month': {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      startDate = monthAgo.toISOString().split('T')[0];
      break;
    }

    case 'quarter': {
      const quarterAgo = new Date(now);
      quarterAgo.setDate(quarterAgo.getDate() - 90);
      startDate = quarterAgo.toISOString().split('T')[0];
      break;
    }

    case 'year': {
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      startDate = yearAgo.toISOString().split('T')[0];
      break;
    }

    case 'ytd':
      startDate = `${now.getFullYear()}-01-01`;
      break;

    default: {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      startDate = sixMonthsAgo.toISOString().split('T')[0];
    }
  }

  return { startDate, endDate };
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

async function getCurrentBalance(workspaceId: string): Promise<number> {
  const accountBalances = await prisma.$queryRaw<Array<{ balance: number | null }>>`
    SELECT DISTINCT ON (bank_account_id) balance
    FROM bank_transactions
    WHERE workspace_id = ${workspaceId}::uuid
      AND balance IS NOT NULL
    ORDER BY bank_account_id, posted_at DESC
  `;

  return accountBalances.reduce((sum, row) => {
    return sum + (row.balance ? Number(row.balance) : 0);
  }, 0);
}

/**
 * Create Prisma-based reporting repository
 * (Inline implementation to avoid cross-app imports)
 */
function createReportingRepository() {
  return {
    async getTransactionSummary(
      workspaceId: string,
      startDate: string,
      endDate: string,
      _baseCurrency: string
    ) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: { category: true },
          },
        },
      });

      let totalIncome = 0;
      let totalExpenses = 0;
      const categoryTotals = new Map<
        string,
        { income: number; expenses: number; count: number; name: string | null }
      >();

      for (const tx of transactions) {
        const amount = Number(tx.amount);
        const categoryId = tx.categorizations[0]?.category?.id || 'uncategorized';
        const categoryName = tx.categorizations[0]?.category?.name || null;

        if (!categoryTotals.has(categoryId)) {
          categoryTotals.set(categoryId, { income: 0, expenses: 0, count: 0, name: categoryName });
        }

        const cat = categoryTotals.get(categoryId)!;
        cat.count++;

        if (amount >= 0) {
          totalIncome += amount;
          cat.income += amount;
        } else {
          totalExpenses += Math.abs(amount);
          cat.expenses += Math.abs(amount);
        }
      }

      return {
        totalIncome,
        totalExpenses,
        netCashflow: totalIncome - totalExpenses,
        categoryBreakdown: Array.from(categoryTotals.entries()).map(([id, data]) => ({
          categoryId: id === 'uncategorized' ? null : id,
          categoryName: data.name,
          income: data.income,
          expenses: data.expenses,
          count: data.count,
        })),
      };
    },

    async getMonthlyBreakdown(
      workspaceId: string,
      startDate: string,
      endDate: string,
      _baseCurrency: string
    ) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        orderBy: { postedAt: 'asc' },
      });

      const monthlyData = new Map<string, { income: number; expenses: number }>();

      for (const tx of transactions) {
        const month = tx.postedAt.toISOString().slice(0, 7); // YYYY-MM
        const amount = Number(tx.amount);

        if (!monthlyData.has(month)) {
          monthlyData.set(month, { income: 0, expenses: 0 });
        }

        const data = monthlyData.get(month)!;
        if (amount >= 0) {
          data.income += amount;
        } else {
          data.expenses += Math.abs(amount);
        }
      }

      return Array.from(monthlyData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          income: data.income,
          expenses: data.expenses,
          netCashflow: data.income - data.expenses,
        }));
    },
  };
}

/**
 * Get dashboard metrics for a workspace
 *
 * Cached per-request to avoid duplicate fetches.
 */
export const getDashboardMetrics = cache(
  async (
    workspaceId: string,
    baseCurrency: string,
    options: { period?: string; startDate?: string; endDate?: string } = {}
  ): Promise<DashboardMetricsDto> => {
    const { period = 'month', startDate: customStart, endDate: customEnd } = options;

    // Determine date range
    const { startDate, endDate } =
      customStart && customEnd
        ? { startDate: customStart, endDate: customEnd }
        : getDateRange(period);

    const repo = createReportingRepository();

    // Get summary data
    const summary = await repo.getTransactionSummary(workspaceId, startDate, endDate, baseCurrency);
    const monthlyBreakdown = await repo.getMonthlyBreakdown(
      workspaceId,
      startDate,
      endDate,
      baseCurrency
    );

    // Calculate burn rate (average monthly expenses)
    const totalMonths = monthlyBreakdown.length || 1;
    const burnRate = summary.totalExpenses / totalMonths;

    // Get current balance for runway
    const currentBalance = await getCurrentBalance(workspaceId);

    // Calculate runway
    const monthlySummaries: MonthlySummary[] = monthlyBreakdown.map((m) => ({
      month: m.month,
      income: m.income,
      expenses: m.expenses,
      netCashflow: m.netCashflow,
    }));

    const runway = calculateRunway({
      currentBalance,
      monthlySummaries,
      currency: baseCurrency,
    });

    // Calculate trend (compare current month to previous)
    const currentMonthData = monthlyBreakdown[monthlyBreakdown.length - 1];
    const previousMonthData = monthlyBreakdown[monthlyBreakdown.length - 2];

    const currentNetCashflow = currentMonthData?.netCashflow || 0;
    const previousNetCashflow = previousMonthData?.netCashflow || 0;

    const percentageChange =
      previousNetCashflow !== 0
        ? ((currentNetCashflow - previousNetCashflow) / Math.abs(previousNetCashflow)) * 100
        : 0;

    const direction: 'up' | 'down' | 'stable' =
      percentageChange > 5 ? 'up' : percentageChange < -5 ? 'down' : 'stable';

    // Format money helper
    const formatMoney = (amount: number): MoneyDto => ({
      amount,
      currency: baseCurrency,
      formatted: formatCurrency(amount, baseCurrency),
    });

    // Format monthly data
    const monthlyData: MonthlyDataDto[] = monthlyBreakdown.map((m) => ({
      month: m.month,
      monthLabel: formatMonthLabel(m.month),
      income: m.income,
      expenses: m.expenses,
      netCashflow: m.netCashflow,
    }));

    // Calculate category breakdown with percentages
    const totalExpensesForPercent =
      summary.categoryBreakdown.reduce((sum, c) => sum + c.expenses, 0) || 1;
    const totalIncomeForPercent =
      summary.categoryBreakdown.reduce((sum, c) => sum + c.income, 0) || 1;

    const categoryBreakdown = summary.categoryBreakdown.flatMap((cat) => {
      const items = [];
      if (cat.income > 0) {
        items.push({
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          type: 'income' as const,
          amount: cat.income,
          currency: baseCurrency,
          percentage: Math.round((cat.income / totalIncomeForPercent) * 1000) / 10,
          transactionCount: cat.count,
        });
      }
      if (cat.expenses > 0) {
        items.push({
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          type: 'expense' as const,
          amount: cat.expenses,
          currency: baseCurrency,
          percentage: Math.round((cat.expenses / totalExpensesForPercent) * 1000) / 10,
          transactionCount: cat.count,
        });
      }
      return items;
    });

    return {
      period: { startDate, endDate },
      baseCurrency,
      totalIncome: formatMoney(summary.totalIncome),
      totalExpenses: formatMoney(summary.totalExpenses),
      netCashflow: formatMoney(summary.netCashflow),
      burnRate: formatMoney(burnRate),
      runway: {
        monthsRemaining: runway.monthsRemaining,
        currentCash: runway.currentCash,
        monthlyBurnRate: runway.monthlyBurnRate,
        avgMonthlyExpenses: runway.avgMonthlyExpenses,
        avgMonthlyIncome: runway.avgMonthlyIncome,
        status: runway.status,
        projectedZeroDate: runway.projectedZeroDate?.toISOString().split('T')[0] || null,
        description: getRunwayDescription(runway),
      },
      trend: {
        percentageChange: Math.round(percentageChange * 10) / 10,
        direction,
        currentMonth: { amount: currentNetCashflow, currency: baseCurrency },
        previousMonth: { amount: previousNetCashflow, currency: baseCurrency },
      },
      categoryBreakdown,
      monthlyData,
    };
  }
);

/**
 * Get recent transactions for dashboard widget
 *
 * Cached per-request.
 */
export const getRecentTransactions = cache(
  async (workspaceId: string, limit: number = 5): Promise<TransactionSummaryDto[]> => {
    const transactions = await prisma.bankTransaction.findMany({
      where: { workspaceId },
      orderBy: { postedAt: 'desc' },
      take: limit,
      include: {
        categorizations: {
          where: { approved: true },
          take: 1,
          include: {
            category: {
              select: { name: true },
            },
          },
        },
      },
    });

    return transactions.map((tx) => ({
      id: tx.id,
      postedAt: tx.postedAt.toISOString(),
      description: tx.description,
      amount: tx.amount.toString(),
      currency: tx.currency,
      categoryName: tx.categorizations[0]?.category.name ?? null,
    }));
  }
);
