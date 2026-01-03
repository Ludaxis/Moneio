/**
 * Aged Receivables Report API
 *
 * GET /api/reports/aged-receivables?workspaceId=xxx&asOfDate=YYYY-MM-DD
 *
 * Returns aging report for accounts receivable including:
 * - Outstanding invoices by age bucket
 * - Grouped by counterparty
 * - Total overdue amounts and percentages
 * - Average days outstanding
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { AgedReportService } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createPrismaReportRepository } from '@/lib/repositories/report-repository';
import { createServerClient } from '@/lib/supabase';
import { transformMoney } from '@/lib/utils/money-transform';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, asOfDate } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'invoice:read');
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
    const service = new AgedReportService(repository);

    // Generate report
    const report = await service.generate({
      workspaceId,
      asOfDate,
      baseCurrency,
      type: 'receivables',
    });

    // Transform for JSON response
    const transformBucketSummary = (
      summary: Record<string, { amount: number; currency: string }>
    ) => {
      const result: Record<string, ReturnType<typeof transformMoney>> = {};
      for (const [key, value] of Object.entries(summary)) {
        result[key] = transformMoney(value);
      }
      return result;
    };

    return NextResponse.json({
      metadata: report.metadata,
      type: report.type,
      asOfDate: report.asOfDate,
      buckets: report.buckets,
      byCounterparty: report.byCounterparty.map((cp) => ({
        counterpartyId: cp.counterpartyId,
        counterpartyName: cp.counterpartyName,
        items: cp.items.map((item) => ({
          id: item.id,
          documentNumber: item.documentNumber,
          issueDate: item.issueDate,
          dueDate: item.dueDate,
          originalAmount: transformMoney(item.originalAmount),
          outstandingAmount: transformMoney(item.outstandingAmount),
          daysOverdue: item.daysOverdue,
          bucket: item.bucket,
        })),
        bucketTotals: transformBucketSummary(cp.bucketTotals),
        totalOutstanding: transformMoney(cp.totalOutstanding),
      })),
      bucketSummary: transformBucketSummary(report.bucketSummary),
      totalOutstanding: transformMoney(report.totalOutstanding),
      totalOverdue: transformMoney(report.totalOverdue),
      overduePercentage: report.overduePercentage,
      averageDaysOutstanding: report.averageDaysOutstanding,
    });
  } catch (error) {
    console.error('Failed to generate aged receivables report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
