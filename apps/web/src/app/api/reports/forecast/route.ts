/**
 * Cash Flow Forecast API
 *
 * GET /api/reports/forecast?workspaceId=xxx&months=6
 *
 * Returns a cash flow forecast including:
 * - Historical months for context
 * - Projected months with confidence levels
 * - Summary with insights
 */

import { prisma } from '@moneio/db';
import {
  detectRecurringPatterns,
  generateForecast,
  toMonthlyAmount,
  type ForecastInput,
  type ForecastRecurringItem,
  type MonthlySummary,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  months: z.coerce.number().int().min(3).max(12).default(6),
});

/**
 * GET /api/reports/forecast
 * Generate cash flow forecast for a workspace
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
      months: searchParams.get('months') || 6,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, months } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get workspace for base currency
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { baseCurrency: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Get historical transaction data (12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        postedAt: { gte: twelveMonthsAgo },
      },
      select: {
        id: true,
        postedAt: true,
        description: true,
        amount: true,
        currency: true,
        categorizations: {
          where: { approved: true },
          take: 1,
          include: { category: { select: { id: true, name: true } } },
        },
      },
      orderBy: { postedAt: 'desc' },
    });

    // Group transactions by month for historical summaries
    const historicalMonths = calculateHistoricalMonths(transactions);

    // Detect recurring patterns
    const inputTransactions = transactions.map((tx) => ({
      id: tx.id,
      postedAt: tx.postedAt,
      description: tx.description,
      amount: tx.amount.toNumber(),
      currency: tx.currency,
      categorizations: tx.categorizations.map((c) => ({
        category: c.category ? { id: c.category.id, name: c.category.name } : null,
      })),
    }));

    const allPatterns = detectRecurringPatterns(inputTransactions, {
      minOccurrences: 3,
      minConfidence: 0.5,
    });

    // Separate recurring expenses and income
    const activePatterns = allPatterns.filter((p) => p.isActive);

    const recurringExpenses: ForecastRecurringItem[] = activePatterns
      .filter((p) => p.avgAmount < 0)
      .map((p) => ({
        name: p.merchantName,
        amount: Math.abs(p.avgAmount),
        frequency: p.frequency,
        monthlyAmount: toMonthlyAmount(Math.abs(p.avgAmount), p.frequency),
        category: p.categoryName,
      }));

    const recurringIncome: ForecastRecurringItem[] = activePatterns
      .filter((p) => p.avgAmount > 0)
      .map((p) => ({
        name: p.merchantName,
        amount: p.avgAmount,
        frequency: p.frequency,
        monthlyAmount: toMonthlyAmount(p.avgAmount, p.frequency),
        category: p.categoryName,
      }));

    // Get current balance
    const currentBalance = await getCurrentBalance(workspaceId);

    // Generate forecast
    const forecastInput: ForecastInput = {
      currentBalance,
      historicalMonths,
      recurringExpenses,
      recurringIncome,
      currency: workspace.baseCurrency,
      forecastMonths: months,
    };

    const forecast = generateForecast(forecastInput);

    // Format response
    return NextResponse.json({
      currency: forecast.currency,
      currentBalance: forecast.currentBalance,
      overallConfidence: forecast.overallConfidence,
      generatedAt: forecast.generatedAt.toISOString(),
      months: forecast.months.map((m) => ({
        month: m.month,
        label: m.label,
        projectedIncome: m.projectedIncome,
        projectedExpenses: m.projectedExpenses,
        netCashflow: m.netCashflow,
        projectedBalance: m.projectedBalance,
        confidence: m.confidence,
        isActual: m.isActual,
      })),
      summary: {
        avgMonthlyIncome: forecast.summary.avgMonthlyIncome,
        avgMonthlyExpenses: forecast.summary.avgMonthlyExpenses,
        totalRecurringExpenses: forecast.summary.totalRecurringExpenses,
        totalRecurringIncome: forecast.summary.totalRecurringIncome,
        endingBalance: forecast.summary.endingBalance,
        monthsUntilNegative: forecast.summary.monthsUntilNegative,
        trend: forecast.summary.trend,
        insights: forecast.summary.insights,
      },
      // Include recurring items for transparency
      recurring: {
        expenses: recurringExpenses.slice(0, 10).map((r) => ({
          name: r.name,
          amount: r.amount,
          frequency: r.frequency,
          monthlyAmount: r.monthlyAmount,
          category: r.category,
        })),
        income: recurringIncome.slice(0, 10).map((r) => ({
          name: r.name,
          amount: r.amount,
          frequency: r.frequency,
          monthlyAmount: r.monthlyAmount,
          category: r.category,
        })),
      },
      // Metadata
      dataQuality: {
        historicalMonths: historicalMonths.length,
        recurringExpensesDetected: recurringExpenses.length,
        recurringIncomeDetected: recurringIncome.length,
        transactionsAnalyzed: transactions.length,
      },
    });
  } catch (error) {
    console.error('Failed to generate forecast:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Calculate historical monthly summaries from transactions
 */
function calculateHistoricalMonths(
  transactions: Array<{
    postedAt: Date;
    amount: { toNumber(): number };
  }>
): MonthlySummary[] {
  const monthlyMap = new Map<string, { income: number; expenses: number }>();

  for (const tx of transactions) {
    const month = tx.postedAt.toISOString().substring(0, 7); // YYYY-MM
    const data = monthlyMap.get(month) || { income: 0, expenses: 0 };
    const amount = tx.amount.toNumber();

    if (amount > 0) {
      data.income += amount;
    } else {
      data.expenses += Math.abs(amount);
    }

    monthlyMap.set(month, data);
  }

  // Convert to sorted array
  return Array.from(monthlyMap.entries())
    .map(([month, data]) => ({
      month,
      income: data.income,
      expenses: data.expenses,
      netCashflow: data.income - data.expenses,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Get current total balance from most recent transaction balances
 */
async function getCurrentBalance(workspaceId: string): Promise<number> {
  const accountBalances = await prisma.$queryRaw<Array<{ balance: number | null }>>`
    SELECT DISTINCT ON (bank_account_id) balance
    FROM bank_transactions
    WHERE workspace_id = ${workspaceId}::uuid
      AND balance IS NOT NULL
    ORDER BY bank_account_id, posted_at DESC
  `;

  return accountBalances.reduce((sum, row) => sum + (row.balance ? Number(row.balance) : 0), 0);
}
