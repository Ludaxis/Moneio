/**
 * Cash Flow Statement Report API
 *
 * GET /api/reports/cash-flow-statement?workspaceId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns complete Cash Flow Statement (Indirect Method) including:
 * - Operating Activities
 * - Investing Activities
 * - Financing Activities
 * - Net change in cash
 * - Beginning and ending cash balances
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { CashFlowService } from '@moneio/domain';
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
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, startDate, endDate } = parsed.data;

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
    const service = new CashFlowService(repository);

    // Build input
    const input = {
      workspaceId,
      startDate,
      endDate,
      baseCurrency,
    };

    // Generate report
    const report = await service.generate(input);

    // Transform for JSON response
    const transformSection = (section: typeof report.sections.operating) => ({
      name: section.name,
      key: section.key,
      items: section.items.map((item) => ({
        description: item.description,
        accountId: item.accountId,
        amount: transformMoney(item.amount),
        previousAmount: item.previousAmount ? transformMoney(item.previousAmount) : undefined,
        isSubtotal: item.isSubtotal,
      })),
      netCashFlow: transformMoney(section.netCashFlow),
      previousNetCashFlow: section.previousNetCashFlow
        ? transformMoney(section.previousNetCashFlow)
        : undefined,
    });

    return NextResponse.json({
      metadata: report.metadata,
      sections: {
        operating: transformSection(report.sections.operating),
        investing: transformSection(report.sections.investing),
        financing: transformSection(report.sections.financing),
      },
      summaries: {
        netCashFromOperating: transformMoney(report.summaries.netCashFromOperating),
        netCashFromInvesting: transformMoney(report.summaries.netCashFromInvesting),
        netCashFromFinancing: transformMoney(report.summaries.netCashFromFinancing),
        netChangeInCash: transformMoney(report.summaries.netChangeInCash),
        beginningCash: transformMoney(report.summaries.beginningCash),
        endingCash: transformMoney(report.summaries.endingCash),
      },
    });
  } catch (error) {
    console.error('Failed to generate cash flow statement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
