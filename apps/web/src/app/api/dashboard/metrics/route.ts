/**
 * Dashboard Metrics API
 *
 * GET /api/dashboard/metrics?workspaceId=xxx&period=month|quarter|year
 *
 * Returns aggregated financial metrics for the dashboard including:
 * - Total income, expenses, and net cashflow
 * - Monthly breakdown with charts data
 * - Category breakdown for pie charts
 * - Trend comparison with previous period
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { ReportingService } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createPrismaReportingRepository } from '@/lib/repositories/reporting-repository';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  period: z.enum(['last7', 'last30', 'month', 'quarter', 'year', 'ytd']).default('month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  baseCurrency: z.string().optional(), // Ignored, we use workspace baseCurrency
});

function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];

  let startDate: string;

  switch (period) {
    case 'last7': {
      // Last 7 days
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString().split('T')[0];
      break;
    }

    case 'last30':
    case 'month': {
      // Last 30 days
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      startDate = monthAgo.toISOString().split('T')[0];
      break;
    }

    case 'quarter': {
      // Last 90 days
      const quarterAgo = new Date(now);
      quarterAgo.setDate(quarterAgo.getDate() - 90);
      startDate = quarterAgo.toISOString().split('T')[0];
      break;
    }

    case 'year': {
      // Last 365 days
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      startDate = yearAgo.toISOString().split('T')[0];
      break;
    }

    case 'ytd':
      // Year to date
      startDate = `${now.getFullYear()}-01-01`;
      break;

    default: {
      // Default to last 6 months for good chart visualization
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      startDate = sixMonthsAgo.toISOString().split('T')[0];
    }
  }

  return { startDate, endDate };
}

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
      period: searchParams.get('period') || 'month',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, period, startDate: customStart, endDate: customEnd } = parsed.data;

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

    // Determine date range
    const { startDate, endDate } =
      customStart && customEnd
        ? { startDate: customStart, endDate: customEnd }
        : getDateRange(period);

    // Create repository and service
    const repository = createPrismaReportingRepository(prisma);
    const service = new ReportingService(repository);

    // Get dashboard metrics
    const metrics = await service.getDashboardMetrics(
      workspaceId,
      startDate,
      endDate,
      workspace.baseCurrency as CurrencyCode
    );

    // Transform Money types to plain numbers for JSON response
    return NextResponse.json({
      period: metrics.period,
      baseCurrency: metrics.baseCurrency,
      totalIncome: {
        amount: metrics.totalIncome.amount / 100, // Convert from cents
        currency: metrics.totalIncome.currency,
        formatted: formatCurrency(metrics.totalIncome.amount / 100, metrics.totalIncome.currency),
      },
      totalExpenses: {
        amount: metrics.totalExpenses.amount / 100,
        currency: metrics.totalExpenses.currency,
        formatted: formatCurrency(
          metrics.totalExpenses.amount / 100,
          metrics.totalExpenses.currency
        ),
      },
      netCashflow: {
        amount: metrics.netCashflow.amount / 100,
        currency: metrics.netCashflow.currency,
        formatted: formatCurrency(metrics.netCashflow.amount / 100, metrics.netCashflow.currency),
      },
      burnRate: {
        amount: metrics.burnRate.amount / 100,
        currency: metrics.burnRate.currency,
        formatted: formatCurrency(metrics.burnRate.amount / 100, metrics.burnRate.currency),
      },
      trend: {
        ...metrics.trend,
        currentMonth: {
          amount: metrics.trend.currentMonth.amount / 100,
          currency: metrics.trend.currentMonth.currency,
        },
        previousMonth: {
          amount: metrics.trend.previousMonth.amount / 100,
          currency: metrics.trend.previousMonth.currency,
        },
      },
      categoryBreakdown: metrics.categoryBreakdown.map((cat) => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        type: cat.type,
        amount: cat.amount.amount / 100,
        currency: cat.amount.currency,
        percentage: Math.round(cat.percentage * 10) / 10,
        transactionCount: cat.transactionCount,
      })),
      // For charts: monthly data formatted for Recharts
      monthlyData: await getMonthlyChartData(
        service,
        workspaceId,
        startDate,
        endDate,
        workspace.baseCurrency as CurrencyCode
      ),
    });
  } catch (error) {
    console.error('Failed to get dashboard metrics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getMonthlyChartData(
  service: ReportingService,
  workspaceId: string,
  startDate: string,
  endDate: string,
  baseCurrency: CurrencyCode
) {
  const cashflow = await service.getCashflowReport(workspaceId, startDate, endDate, baseCurrency);

  return cashflow.byMonth.map((month) => ({
    month: month.month,
    monthLabel: formatMonthLabel(month.month),
    income: month.income.amount / 100,
    expenses: month.expenses.amount / 100,
    netCashflow: month.netCashflow.amount / 100,
  }));
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
