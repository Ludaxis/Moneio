/**
 * VAT Report API
 *
 * GET /api/reports/vat?workspaceId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns VAT report including:
 * - VAT collected (from sales)
 * - VAT paid (from purchases)
 * - Net VAT (liability or refund)
 * - Breakdown by VAT rate
 * - Individual VAT entries
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

    // Get VAT report
    const report = await service.getVatReport(
      workspaceId,
      startDate,
      endDate,
      workspace.baseCurrency as CurrencyCode
    );

    // Transform Money types to plain numbers for JSON response
    return NextResponse.json({
      period: report.period,
      baseCurrency: report.baseCurrency,
      vatCollected: {
        amount: report.vatCollected.amount / 100,
        currency: report.vatCollected.currency,
        formatted: formatCurrency(report.vatCollected.amount / 100, report.vatCollected.currency),
      },
      vatPaid: {
        amount: report.vatPaid.amount / 100,
        currency: report.vatPaid.currency,
        formatted: formatCurrency(report.vatPaid.amount / 100, report.vatPaid.currency),
      },
      netVat: {
        amount: report.netVat.amount / 100,
        currency: report.netVat.currency,
        formatted: formatCurrency(report.netVat.amount / 100, report.netVat.currency),
        isRefund: report.netVat.amount < 0,
      },
      byRate: report.byRate.map((rate) => ({
        rate: rate.rate,
        rateLabel: rate.rateLabel,
        collected: {
          amount: rate.collected.amount / 100,
          currency: rate.collected.currency,
          formatted: formatCurrency(rate.collected.amount / 100, rate.collected.currency),
        },
        paid: {
          amount: rate.paid.amount / 100,
          currency: rate.paid.currency,
          formatted: formatCurrency(rate.paid.amount / 100, rate.paid.currency),
        },
      })),
      entries: report.entries.map((entry) => ({
        invoiceId: entry.invoiceId,
        invoiceNumber: entry.invoiceNumber,
        issueDate: entry.issueDate,
        vatRate: entry.vatRate,
        vatRateLabel: `${(entry.vatRate * 100).toFixed(0)}%`,
        vatAmount: {
          amount: entry.vatAmount.amount / 100,
          currency: entry.vatAmount.currency,
          formatted: formatCurrency(entry.vatAmount.amount / 100, entry.vatAmount.currency),
        },
        type: entry.type,
        merchantName: entry.merchantName,
      })),
    });
  } catch (error) {
    console.error('Failed to get VAT report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
