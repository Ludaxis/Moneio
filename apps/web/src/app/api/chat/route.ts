/**
 * Financial Chat API
 *
 * POST /api/chat - Process a natural language financial question
 *
 * Accepts questions like:
 * - "How much did I spend this month?"
 * - "What's my cash runway?"
 * - "Show my recurring expenses"
 * - "Am I profitable?"
 */

import {
  FinancialChatService,
  type FinancialDataProvider,
} from '@moneio/ai';
import { prisma } from '@moneio/db';
import {
  detectRecurringPatterns,
  getRecurringSummary,
  calculateRunway,
  getRunwayDescription,
  type MonthlySummary,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  workspaceId: z.string().uuid(),
  message: z.string().min(1).max(500),
  conversationId: z.string().optional(),
});

/**
 * POST /api/chat
 * Process a financial question and return an AI-generated response
 */
export async function POST(request: Request) {
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
      { workspaceId, message, conversationId },
      { workspaceId, baseCurrency: workspace.baseCurrency }
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
  };
}
