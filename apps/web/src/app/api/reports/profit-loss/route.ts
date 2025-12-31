/**
 * Profit & Loss Report API
 *
 * GET /api/reports/profit-loss?workspaceId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns complete P&L statement including:
 * - Revenue, COGS, Operating Expenses breakdown
 * - Gross Profit, Operating Income, Net Income
 * - Optional comparative period analysis
 * - Monthly breakdown for charts
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { ProfitLossService } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createPrismaReportRepository } from '@/lib/repositories/report-repository';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comparative: z.enum(['true', 'false']).optional(),
  previousStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  previousEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  monthlyBreakdown: z.enum(['true', 'false']).optional(),
});

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function transformMoney(money: { amount: number; currency: string }) {
  return {
    amount: money.amount,
    currency: money.currency,
    formatted: formatCurrency(money.amount, money.currency),
  };
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
      comparative: searchParams.get('comparative'),
      previousStartDate: searchParams.get('previousStartDate'),
      previousEndDate: searchParams.get('previousEndDate'),
      monthlyBreakdown: searchParams.get('monthlyBreakdown'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      workspaceId,
      startDate,
      endDate,
      comparative,
      previousStartDate,
      previousEndDate,
      monthlyBreakdown,
    } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'gl:read');
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

    const baseCurrency = workspace.baseCurrency as CurrencyCode;

    // Check if GL accounts exist
    const glAccountCount = await prisma.gLAccount.count({
      where: { workspaceId, isActive: true },
    });

    // If no GL accounts, return empty P&L report
    if (glAccountCount === 0) {
      const emptySection = {
        name: '',
        key: '',
        items: [],
        subtotal: { amount: 0, currency: baseCurrency, formatted: formatCurrency(0, baseCurrency) },
      };

      return NextResponse.json({
        metadata: {
          generatedAt: new Date().toISOString(),
          workspaceId,
          baseCurrency,
          period: { start: startDate, end: endDate },
        },
        sections: {
          revenue: { ...emptySection, name: 'Revenue', key: 'revenue' },
          costOfGoodsSold: { ...emptySection, name: 'Cost of Goods Sold', key: 'cogs' },
          operatingExpenses: { ...emptySection, name: 'Operating Expenses', key: 'operatingExpenses' },
          otherIncome: { ...emptySection, name: 'Other Income', key: 'otherIncome' },
          otherExpenses: { ...emptySection, name: 'Other Expenses', key: 'otherExpenses' },
        },
        summaries: {
          grossProfit: { amount: 0, currency: baseCurrency, formatted: formatCurrency(0, baseCurrency) },
          operatingIncome: { amount: 0, currency: baseCurrency, formatted: formatCurrency(0, baseCurrency) },
          netIncome: { amount: 0, currency: baseCurrency, formatted: formatCurrency(0, baseCurrency) },
        },
        monthlyBreakdown: [],
        _notice: 'No GL accounts configured. Set up your Chart of Accounts to generate P&L reports.',
      });
    }

    // Create repository and service
    const repository = createPrismaReportRepository(prisma);
    const service = new ProfitLossService(repository);

    // Build input
    const input = {
      workspaceId,
      startDate,
      endDate,
      baseCurrency,
      options: {
        comparative: comparative === 'true',
        groupBy: monthlyBreakdown === 'true' ? ('month' as const) : undefined,
      },
      previousPeriod:
        comparative === 'true' && previousStartDate && previousEndDate
          ? { start: previousStartDate, end: previousEndDate }
          : undefined,
    };

    // Generate report
    const report = await service.generate(input);

    // Transform for JSON response
    const transformSection = (section: typeof report.sections.revenue) => ({
      name: section.name,
      key: section.key,
      items: section.items.map((item) => ({
        accountId: item.accountId,
        accountCode: item.accountCode,
        accountName: item.accountName,
        amount: transformMoney(item.amount),
        previousAmount: item.previousAmount ? transformMoney(item.previousAmount) : undefined,
        change: item.change ? transformMoney(item.change) : undefined,
        changePercentage: item.changePercentage,
        depth: item.depth,
        isSubtotal: item.isSubtotal,
      })),
      subtotal: transformMoney(section.subtotal),
      previousSubtotal: section.previousSubtotal
        ? transformMoney(section.previousSubtotal)
        : undefined,
    });

    return NextResponse.json({
      metadata: report.metadata,
      sections: {
        revenue: transformSection(report.sections.revenue),
        costOfGoodsSold: transformSection(report.sections.costOfGoodsSold),
        operatingExpenses: transformSection(report.sections.operatingExpenses),
        otherIncome: transformSection(report.sections.otherIncome),
        otherExpenses: transformSection(report.sections.otherExpenses),
      },
      summaries: {
        grossProfit: transformMoney(report.summaries.grossProfit),
        operatingIncome: transformMoney(report.summaries.operatingIncome),
        netIncome: transformMoney(report.summaries.netIncome),
        previousGrossProfit: report.summaries.previousGrossProfit
          ? transformMoney(report.summaries.previousGrossProfit)
          : undefined,
        previousOperatingIncome: report.summaries.previousOperatingIncome
          ? transformMoney(report.summaries.previousOperatingIncome)
          : undefined,
        previousNetIncome: report.summaries.previousNetIncome
          ? transformMoney(report.summaries.previousNetIncome)
          : undefined,
      },
      monthlyBreakdown: report.monthlyBreakdown,
    });
  } catch (error) {
    console.error('Failed to generate P&L report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
