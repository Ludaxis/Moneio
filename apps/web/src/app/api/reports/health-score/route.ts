/**
 * Financial Health Score API
 *
 * GET /api/reports/health-score?workspaceId=xxx
 *
 * Returns a comprehensive financial health score including:
 * - Overall score (0-100) and grade (A-F)
 * - Individual metric scores with explanations
 * - Recommendations for improvement
 */

import { prisma } from '@moneio/db';
import {
  calculateHealthScore,
  calculateRunway,
  calculateVolatility,
  detectRecurringPatterns,
  getRecurringSummary,
  type HealthScoreInput,
  type MonthlySummary,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
});

/**
 * GET /api/reports/health-score
 * Calculate financial health score for a workspace
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
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId } = parsed.data;

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

    // Get transaction data for the last 12 months
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

    // Calculate monthly summaries
    const monthlyData = calculateMonthlySummaries(transactions);

    // Calculate averages from recent months
    const recentMonths = monthlyData.slice(-3);
    const avgMonthlyIncome =
      recentMonths.length > 0
        ? recentMonths.reduce((sum, m) => sum + m.income, 0) / recentMonths.length
        : 0;
    const avgMonthlyExpenses =
      recentMonths.length > 0
        ? recentMonths.reduce((sum, m) => sum + m.expenses, 0) / recentMonths.length
        : 0;

    // Calculate volatility
    const incomeValues = monthlyData.map((m) => m.income);
    const expenseValues = monthlyData.map((m) => m.expenses);
    const incomeVolatility = calculateVolatility(incomeValues);
    const expenseVolatility = calculateVolatility(expenseValues);

    // Get current balance
    const currentBalance = await getCurrentBalance(workspaceId);

    // Calculate runway
    const runway = calculateRunway({
      currentBalance,
      monthlySummaries: monthlyData,
      currency: workspace.baseCurrency,
    });

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

    const activeExpensePatterns = allPatterns.filter((p) => p.isActive && p.avgAmount < 0);
    const recurringSummary = getRecurringSummary(activeExpensePatterns);

    // Build health score input
    const healthInput: HealthScoreInput = {
      currentBalance,
      monthlyBurnRate: runway.monthlyBurnRate,
      avgMonthlyIncome,
      avgMonthlyExpenses,
      runwayMonths: runway.monthsRemaining,
      recurringExpenseCount: activeExpensePatterns.length,
      monthlyRecurringExpenses: recurringSummary.monthlyTotal,
      incomeVolatility,
      expenseVolatility,
      currency: workspace.baseCurrency,
    };

    // Calculate health score
    const healthScore = calculateHealthScore(healthInput);

    // Format response
    return NextResponse.json({
      overallScore: healthScore.overallScore,
      rating: healthScore.rating,
      grade: healthScore.grade,
      summary: healthScore.summary,
      calculatedAt: healthScore.calculatedAt.toISOString(),
      currency: healthScore.currency,
      metrics: healthScore.metrics.map((m) => ({
        name: m.name,
        score: m.score,
        weight: m.weight,
        rating: m.rating,
        description: m.description,
        recommendation: m.recommendation,
      })),
      recommendations: healthScore.recommendations,
      // Supporting data for transparency
      data: {
        currentBalance,
        avgMonthlyIncome: roundToTwo(avgMonthlyIncome),
        avgMonthlyExpenses: roundToTwo(avgMonthlyExpenses),
        monthlyBurnRate: roundToTwo(runway.monthlyBurnRate),
        runwayMonths: runway.monthsRemaining,
        recurringExpenseCount: activeExpensePatterns.length,
        monthlyRecurringExpenses: roundToTwo(recurringSummary.monthlyTotal),
        incomeVolatility: roundToTwo(incomeVolatility),
        expenseVolatility: roundToTwo(expenseVolatility),
        monthsAnalyzed: monthlyData.length,
        transactionsAnalyzed: transactions.length,
      },
    });
  } catch (error) {
    console.error('Failed to calculate health score:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Calculate monthly summaries from transactions
 */
function calculateMonthlySummaries(
  transactions: Array<{
    postedAt: Date;
    amount: { toNumber(): number };
  }>
): MonthlySummary[] {
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
 * Get current total balance
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

function roundToTwo(value: number): number {
  if (!isFinite(value)) return value;
  return Math.round(value * 100) / 100;
}
