/**
 * Balance Sheet Report API
 *
 * GET /api/reports/balance-sheet?workspaceId=xxx&asOfDate=YYYY-MM-DD
 *
 * Returns complete Balance Sheet including:
 * - Assets (Current, Fixed, Other)
 * - Liabilities (Current, Long-term)
 * - Equity (Capital, Retained Earnings)
 * - Key financial ratios
 * - Balance verification
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { BalanceSheetService } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createPrismaReportRepository } from '@/lib/repositories/report-repository';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comparative: z.enum(['true', 'false']).optional(),
  previousAsOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
      asOfDate: searchParams.get('asOfDate'),
      comparative: searchParams.get('comparative'),
      previousAsOfDate: searchParams.get('previousAsOfDate'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, asOfDate, comparative, previousAsOfDate } = parsed.data;

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

    // Create repository and service
    const repository = createPrismaReportRepository(prisma);
    const service = new BalanceSheetService(repository);

    // Build input
    const input = {
      workspaceId,
      asOfDate,
      baseCurrency,
      options: {
        comparative: comparative === 'true',
      },
      previousAsOfDate: comparative === 'true' ? previousAsOfDate : undefined,
    };

    // Generate report
    const report = await service.generate(input);

    // Transform for JSON response
    const transformSubsection = (subsection: (typeof report.sections.assets.subsections)[0]) => ({
      name: subsection.name,
      key: subsection.key,
      items: subsection.items.map((item) => ({
        accountId: item.accountId,
        accountCode: item.accountCode,
        accountName: item.accountName,
        balance: transformMoney(item.balance),
        previousBalance: item.previousBalance ? transformMoney(item.previousBalance) : undefined,
        change: item.change ? transformMoney(item.change) : undefined,
        changePercentage: item.changePercentage,
        depth: item.depth,
        isSubtotal: item.isSubtotal,
      })),
      subtotal: transformMoney(subsection.subtotal),
      previousSubtotal: subsection.previousSubtotal
        ? transformMoney(subsection.previousSubtotal)
        : undefined,
    });

    const transformSection = (section: typeof report.sections.assets) => ({
      name: section.name,
      key: section.key,
      subsections: section.subsections.map(transformSubsection),
      total: transformMoney(section.total),
      previousTotal: section.previousTotal ? transformMoney(section.previousTotal) : undefined,
    });

    return NextResponse.json({
      metadata: report.metadata,
      sections: {
        assets: transformSection(report.sections.assets),
        liabilities: transformSection(report.sections.liabilities),
        equity: transformSection(report.sections.equity),
      },
      summaries: {
        totalAssets: transformMoney(report.summaries.totalAssets),
        totalLiabilities: transformMoney(report.summaries.totalLiabilities),
        totalEquity: transformMoney(report.summaries.totalEquity),
        totalLiabilitiesAndEquity: transformMoney(report.summaries.totalLiabilitiesAndEquity),
        isBalanced: report.summaries.isBalanced,
        difference: transformMoney(report.summaries.difference),
      },
      ratios: report.ratios
        ? {
            currentRatio: report.ratios.currentRatio,
            quickRatio: report.ratios.quickRatio,
            debtToEquity: report.ratios.debtToEquity,
            workingCapital: report.ratios.workingCapital
              ? transformMoney(report.ratios.workingCapital)
              : undefined,
          }
        : undefined,
    });
  } catch (error) {
    console.error('Failed to generate balance sheet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
