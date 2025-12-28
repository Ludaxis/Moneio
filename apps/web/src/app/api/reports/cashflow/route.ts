/**
 * Cashflow Report API
 *
 * GET /api/reports/cashflow?workspaceId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns detailed cashflow report including:
 * - Total income and expenses
 * - Net cashflow
 * - Monthly breakdown
 * - Category breakdown
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
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, startDate, endDate } = parsed.data;

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

    // Create repository and service
    const repository = createPrismaReportingRepository(prisma);
    const service = new ReportingService(repository);

    // Get cashflow report
    const report = await service.getCashflowReport(
      workspaceId,
      startDate,
      endDate,
      workspace.baseCurrency as CurrencyCode
    );

    // Transform Money types to plain numbers for JSON response
    return NextResponse.json({
      period: report.period,
      baseCurrency: report.baseCurrency,
      income: {
        amount: report.income.amount / 100,
        currency: report.income.currency,
        formatted: formatCurrency(report.income.amount / 100, report.income.currency),
      },
      expenses: {
        amount: report.expenses.amount / 100,
        currency: report.expenses.currency,
        formatted: formatCurrency(report.expenses.amount / 100, report.expenses.currency),
      },
      netCashflow: {
        amount: report.netCashflow.amount / 100,
        currency: report.netCashflow.currency,
        formatted: formatCurrency(report.netCashflow.amount / 100, report.netCashflow.currency),
      },
      byCategory: report.byCategory.map((cat) => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        type: cat.type,
        amount: cat.amount.amount / 100,
        currency: cat.amount.currency,
        formatted: formatCurrency(cat.amount.amount / 100, cat.amount.currency),
        percentage: Math.round(cat.percentage * 10) / 10,
        transactionCount: cat.transactionCount,
      })),
      byMonth: report.byMonth.map((month) => ({
        month: month.month,
        income: {
          amount: month.income.amount / 100,
          currency: month.income.currency,
          formatted: formatCurrency(month.income.amount / 100, month.income.currency),
        },
        expenses: {
          amount: month.expenses.amount / 100,
          currency: month.expenses.currency,
          formatted: formatCurrency(month.expenses.amount / 100, month.expenses.currency),
        },
        netCashflow: {
          amount: month.netCashflow.amount / 100,
          currency: month.netCashflow.currency,
          formatted: formatCurrency(month.netCashflow.amount / 100, month.netCashflow.currency),
        },
      })),
    });
  } catch (error) {
    console.error('Failed to get cashflow report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
