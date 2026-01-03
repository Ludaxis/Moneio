/**
 * Financial Chat API (serverless-friendly)
 *
 * POST /api/chat - Process a natural language financial question
 *
 * Accepts questions like:
 * - "How much did I spend this month?"
 * - "What's my cash runway?"
 * - "Show my recurring expenses"
 * - "Am I profitable?"
 *
 * Note: Uses manual auth due to complex data provider pattern.
 * Observability is added via traceApiRoute.
 */

import { FinancialChatService, type FinancialDataProvider } from '@moneio/ai';
import { prisma } from '@moneio/db';
import {
  detectRecurringPatterns,
  getRecurringSummary,
  calculateRunway,
  getRunwayDescription,
  trackSubscriptions,
  getSubscriptionSummary,
  detectMoneyLeaks,
  getMoneyLeaksSummary,
  type MonthlySummary,
} from '@moneio/domain';
import { traceApiRoute } from '@moneio/observability/integrations/nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { initWebObservability } from '@/lib/observability';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

initWebObservability();

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  workspaceId: z.string().uuid(),
  message: z.string().min(1).max(500),
  conversationId: z.string().nullish(), // Allow null or undefined
});

/**
 * POST /api/chat
 * Process a financial question and return an AI-generated response
 */
async function chatHandler(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, message, conversationId } = parsed.data;

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

    // Create data provider and chat service
    const dataProvider = createDataProvider(workspaceId, workspace.baseCurrency);
    const chatService = new FinancialChatService(dataProvider);

    // Process the message
    const response = await chatService.chat(
      { workspaceId, message, conversationId: conversationId ?? undefined },
      { workspaceId, baseCurrency: workspace.baseCurrency }
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = traceApiRoute('chat.message', chatHandler);

/**
 * Create a data provider that queries the database
 */
function createDataProvider(workspaceId: string, baseCurrency: string): FinancialDataProvider {
  return {
    async getSpendingByMerchant(
      _workspaceId: string,
      merchant: string,
      startDate: Date,
      endDate: Date
    ) {
      // Search for transactions matching the merchant name
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
          description: { contains: merchant, mode: 'insensitive' },
          amount: { lt: 0 }, // Expenses only
        },
        select: { amount: true },
      });

      const total = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount.toNumber()), 0);

      return {
        total,
        count: transactions.length,
        currency: baseCurrency,
      };
    },

    async getSpendingByCategory(
      _workspaceId: string,
      category: string,
      startDate: Date,
      endDate: Date
    ) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
          amount: { lt: 0 },
          categorizations: {
            some: {
              approved: true,
              category: {
                name: { contains: category, mode: 'insensitive' },
              },
            },
          },
        },
        select: { amount: true },
      });

      const total = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount.toNumber()), 0);

      return {
        total,
        count: transactions.length,
        currency: baseCurrency,
      };
    },

    async getTotalSpending(_workspaceId: string, startDate: Date, endDate: Date) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
          amount: { lt: 0 },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: { category: { select: { name: true } } },
          },
        },
      });

      const total = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount.toNumber()), 0);

      // Calculate category breakdown
      const categoryMap = new Map<string, number>();
      for (const tx of transactions) {
        const catName = tx.categorizations[0]?.category?.name || 'Uncategorized';
        categoryMap.set(catName, (categoryMap.get(catName) || 0) + Math.abs(tx.amount.toNumber()));
      }

      const breakdown = Array.from(categoryMap.entries())
        .map(([name, amount]) => ({
          name,
          amount,
          percentage: total > 0 ? (amount / total) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      return { total, currency: baseCurrency, breakdown };
    },

    async getTotalIncome(_workspaceId: string, startDate: Date, endDate: Date) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
          amount: { gt: 0 },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: { category: { select: { name: true } } },
          },
        },
      });

      const total = transactions.reduce((sum, tx) => sum + tx.amount.toNumber(), 0);

      // Calculate income sources
      const sourceMap = new Map<string, number>();
      for (const tx of transactions) {
        const source = tx.categorizations[0]?.category?.name || 'Other Income';
        sourceMap.set(source, (sourceMap.get(source) || 0) + tx.amount.toNumber());
      }

      const sources = Array.from(sourceMap.entries())
        .map(([name, amount]) => ({
          name,
          amount,
          percentage: total > 0 ? (amount / total) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      return { total, currency: baseCurrency, sources };
    },

    async getCashflow(_workspaceId: string, startDate: Date, endDate: Date) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
        },
        select: { amount: true },
      });

      let income = 0;
      let expenses = 0;

      for (const tx of transactions) {
        const amount = tx.amount.toNumber();
        if (amount > 0) {
          income += amount;
        } else {
          expenses += Math.abs(amount);
        }
      }

      return {
        income,
        expenses,
        net: income - expenses,
        currency: baseCurrency,
      };
    },

    async getLargestExpenses(_workspaceId: string, startDate: Date, endDate: Date, limit: number) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
          amount: { lt: 0 },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: { category: { select: { name: true } } },
          },
        },
        orderBy: { amount: 'asc' }, // Most negative first
        take: limit,
      });

      const expenses = transactions.map((tx) => ({
        description: tx.description || 'Unknown transaction',
        amount: Math.abs(tx.amount.toNumber()),
        date: tx.postedAt.toISOString().split('T')[0],
        category: tx.categorizations[0]?.category?.name || undefined,
      }));

      return { expenses, currency: baseCurrency };
    },

    async getRecurringExpenses(_workspaceId: string) {
      // Get 12 months of transactions for pattern detection
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 12);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: cutoffDate },
          amount: { lt: 0 }, // Expenses only
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

      const activePatterns = allPatterns.filter((p) => p.isActive);
      const summary = getRecurringSummary(activePatterns);

      const patterns = activePatterns.slice(0, 15).map((p) => ({
        merchant: p.merchantName,
        amount: Math.abs(p.avgAmount),
        frequency: p.frequency,
        nextExpected: p.nextExpected.toISOString().split('T')[0],
      }));

      return {
        patterns,
        monthlyTotal: summary.monthlyTotal,
        currency: baseCurrency,
      };
    },

    async getRunway(_workspaceId: string) {
      // Get monthly data for the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: sixMonthsAgo },
        },
        select: { postedAt: true, amount: true },
      });

      // Group by month
      const monthlyMap = new Map<string, { income: number; expenses: number }>();
      for (const tx of transactions) {
        const month = tx.postedAt.toISOString().substring(0, 7);
        const data = monthlyMap.get(month) || { income: 0, expenses: 0 };
        const amount = tx.amount.toNumber();
        if (amount > 0) {
          data.income += amount;
        } else {
          data.expenses += Math.abs(amount);
        }
        monthlyMap.set(month, data);
      }

      const monthlySummaries: MonthlySummary[] = Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          income: data.income,
          expenses: data.expenses,
          netCashflow: data.income - data.expenses,
        }));

      // Get current balance
      const accountBalances = await prisma.$queryRaw<Array<{ balance: number | null }>>`
        SELECT DISTINCT ON (bank_account_id) balance
        FROM bank_transactions
        WHERE workspace_id = ${workspaceId}::uuid
          AND balance IS NOT NULL
        ORDER BY bank_account_id, posted_at DESC
      `;

      const currentBalance = accountBalances.reduce(
        (sum, row) => sum + (row.balance ? Number(row.balance) : 0),
        0
      );

      const runway = calculateRunway({
        currentBalance,
        monthlySummaries,
        currency: baseCurrency,
      });

      return {
        monthsRemaining: runway.monthsRemaining,
        currentCash: runway.currentCash,
        monthlyBurnRate: runway.monthlyBurnRate,
        status: runway.status,
        description: getRunwayDescription(runway),
        currency: baseCurrency,
      };
    },

    async getPendingInvoices(_workspaceId: string) {
      const invoices = await prisma.invoice.findMany({
        where: {
          workspaceId,
          status: { in: ['PENDING', 'OVERDUE'] },
        },
        include: {
          merchant: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
      });

      const now = new Date();
      const formattedInvoices = invoices.map((inv) => {
        const daysOverdue = inv.dueDate
          ? Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

        return {
          number: inv.invoiceNumber || inv.id.substring(0, 8),
          merchant: inv.merchant?.name || 'Unknown',
          amount: inv.total.toNumber(),
          dueDate: inv.dueDate?.toISOString().split('T')[0] || 'N/A',
          daysOverdue: daysOverdue && daysOverdue > 0 ? daysOverdue : undefined,
        };
      });

      const totalAmount = invoices.reduce((sum, inv) => sum + inv.total.toNumber(), 0);

      return {
        invoices: formattedInvoices,
        totalAmount,
        currency: baseCurrency,
      };
    },

    async getCategoryBreakdown(_workspaceId: string, startDate: Date, endDate: Date) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
          amount: { lt: 0 }, // Expenses only
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: { category: { select: { name: true } } },
          },
        },
      });

      const total = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount.toNumber()), 0);

      const categoryMap = new Map<string, number>();
      for (const tx of transactions) {
        const catName = tx.categorizations[0]?.category?.name || 'Uncategorized';
        categoryMap.set(catName, (categoryMap.get(catName) || 0) + Math.abs(tx.amount.toNumber()));
      }

      const categories = Array.from(categoryMap.entries())
        .map(([name, amount]) => ({
          name,
          amount,
          percentage: total > 0 ? (amount / total) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      return { categories, currency: baseCurrency };
    },

    // New AI-first methods

    async getSubscriptionAnalysis(_workspaceId: string) {
      // Get 12 months of transactions for subscription detection
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 12);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: cutoffDate },
          amount: { lt: 0 },
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

      // First detect recurring patterns, then track as subscriptions
      const patterns = detectRecurringPatterns(inputTransactions, {
        minOccurrences: 2,
        minConfidence: 0.5,
      });
      const subscriptions = trackSubscriptions(patterns);
      const summary = getSubscriptionSummary(subscriptions);

      return {
        subscriptions: subscriptions.map((sub) => ({
          name: sub.merchantName,
          amount: sub.amount,
          frequency: sub.frequency,
          monthlyEquivalent: sub.monthlyEquivalent,
          status: sub.status,
          flags: sub.flags.map((f) => f.type),
        })),
        totalMonthly: summary.totalMonthly,
        totalAnnual: summary.totalAnnual,
        flaggedCount: summary.flaggedCount,
        currency: baseCurrency,
      };
    },

    async getMoneyLeaks(_workspaceId: string) {
      // Get 12 months of transactions
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 12);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: cutoffDate },
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

      // Detect recurring patterns for expense transactions, then track as subscriptions
      const expenseTransactions = inputTransactions.filter((tx) => tx.amount < 0);
      const patterns = detectRecurringPatterns(expenseTransactions, {
        minOccurrences: 2,
        minConfidence: 0.5,
      });
      const subscriptions = trackSubscriptions(patterns);
      const leaks = detectMoneyLeaks(inputTransactions, subscriptions);
      const summary = getMoneyLeaksSummary(leaks);

      return {
        leaks: leaks.map((leak) => ({
          type: leak.type,
          title: leak.title,
          description: leak.description,
          annualImpact: leak.annualImpact,
          recommendation: leak.recommendation,
        })),
        totalPotentialSavings: summary.totalPotentialSavings,
        currency: baseCurrency,
      };
    },

    async getSavingsOpportunities(_workspaceId: string) {
      // Get money leaks and convert to savings opportunities
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 12);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: cutoffDate },
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

      // Detect recurring patterns for expense transactions, then track as subscriptions
      const expenseTransactions = inputTransactions.filter((tx) => tx.amount < 0);
      const patterns = detectRecurringPatterns(expenseTransactions, {
        minOccurrences: 2,
        minConfidence: 0.5,
      });
      const subscriptions = trackSubscriptions(patterns);
      const leaks = detectMoneyLeaks(inputTransactions, subscriptions);

      const opportunities = leaks.map((leak) => ({
        title: leak.title,
        description: leak.description,
        potentialSavings: leak.annualImpact,
        actionable: leak.actionable,
      }));

      return {
        opportunities,
        totalPotentialSavings: leaks.reduce((sum, l) => sum + l.annualImpact, 0),
        currency: baseCurrency,
      };
    },

    async getExpenseComparison(_workspaceId: string, startDate: Date, endDate: Date) {
      // Get current period expenses
      const currentTransactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startDate, lte: endDate },
          amount: { lt: 0 },
        },
        select: { amount: true },
      });

      const currentTotal = currentTransactions.reduce(
        (sum, tx) => sum + Math.abs(tx.amount.toNumber()),
        0
      );

      // Calculate previous period (same duration, immediately before)
      const duration = endDate.getTime() - startDate.getTime();
      const previousStart = new Date(startDate.getTime() - duration);
      const previousEnd = new Date(startDate.getTime() - 1);

      const previousTransactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: previousStart, lte: previousEnd },
          amount: { lt: 0 },
        },
        select: { amount: true },
      });

      const previousTotal = previousTransactions.reduce(
        (sum, tx) => sum + Math.abs(tx.amount.toNumber()),
        0
      );

      const change = currentTotal - previousTotal;
      const changePercent = previousTotal > 0 ? (change / previousTotal) * 100 : 0;
      const trend = changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable';

      return {
        currentPeriod: {
          total: currentTotal,
          periodLabel: 'Current period',
        },
        previousPeriod: {
          total: previousTotal,
          periodLabel: 'Previous period',
        },
        change,
        changePercent,
        trend,
        anomalies: [], // TODO: Add anomaly detection
        currency: baseCurrency,
      };
    },

    async getVendorAnalysis(
      _workspaceId: string,
      merchant: string,
      _startDate: Date,
      _endDate: Date
    ) {
      // Get all transactions for this merchant
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          description: { contains: merchant, mode: 'insensitive' },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: { category: { select: { name: true } } },
          },
        },
        orderBy: { postedAt: 'desc' },
      });

      if (transactions.length === 0) {
        return {
          merchant,
          totalSpent: 0,
          transactionCount: 0,
          averageTransaction: 0,
          firstTransaction: 'N/A',
          lastTransaction: 'N/A',
          frequency: 'none',
          isRecurring: false,
          currency: baseCurrency,
        };
      }

      const amounts = transactions.map((tx) => Math.abs(tx.amount.toNumber()));
      const totalSpent = amounts.reduce((sum, a) => sum + a, 0);
      const averageTransaction = totalSpent / transactions.length;

      // Detect if recurring
      const inputTransactions = transactions.map((tx) => ({
        id: tx.id,
        postedAt: tx.postedAt,
        description: tx.description,
        amount: tx.amount.toNumber(),
        currency: tx.currency,
      }));

      const patterns = detectRecurringPatterns(inputTransactions, {
        minOccurrences: 2,
        minConfidence: 0.5,
      });

      const matchingPattern = patterns.find((p) =>
        p.merchantName.toLowerCase().includes(merchant.toLowerCase())
      );

      return {
        merchant,
        totalSpent,
        transactionCount: transactions.length,
        averageTransaction,
        firstTransaction: transactions[transactions.length - 1].postedAt
          .toISOString()
          .split('T')[0],
        lastTransaction: transactions[0].postedAt.toISOString().split('T')[0],
        frequency: matchingPattern?.frequency || 'irregular',
        isRecurring: !!matchingPattern,
        category: transactions[0].categorizations[0]?.category?.name,
        currency: baseCurrency,
      };
    },

    async getInvoiceStatus(_workspaceId: string) {
      const invoices = await prisma.invoice.findMany({
        where: { workspaceId },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          dueDate: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      const paid = invoices.filter((i) => i.status === 'paid');
      const pending = invoices.filter((i) => i.status === 'pending');
      const overdue = invoices.filter(
        (i) => i.status === 'pending' && i.dueDate && i.dueDate < now
      );

      const totalOutstanding = [...pending].reduce((sum, i) => sum + i.total.toNumber(), 0);
      const totalOverdue = overdue.reduce((sum, i) => sum + i.total.toNumber(), 0);

      // Find oldest overdue
      let oldestOverdue;
      if (overdue.length > 0) {
        const oldest = overdue.reduce((a, b) =>
          (a.dueDate?.getTime() || 0) < (b.dueDate?.getTime() || 0) ? a : b
        );
        oldestOverdue = {
          number: oldest.invoiceNumber || oldest.id.substring(0, 8),
          daysOverdue: oldest.dueDate
            ? Math.floor((now.getTime() - oldest.dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
          amount: oldest.total.toNumber(),
        };
      }

      // Recent payments (use updatedAt as proxy for paid date)
      const recentPayments = paid.slice(0, 5).map((inv) => ({
        number: inv.invoiceNumber || inv.id.substring(0, 8),
        amount: inv.total.toNumber(),
        paidDate: inv.updatedAt?.toISOString().split('T')[0] || 'N/A',
      }));

      return {
        overview: {
          total: invoices.length,
          paid: paid.length,
          pending: pending.length,
          overdue: overdue.length,
        },
        totalOutstanding,
        totalOverdue,
        oldestOverdue,
        recentPayments,
        currency: baseCurrency,
      };
    },
  };
}
