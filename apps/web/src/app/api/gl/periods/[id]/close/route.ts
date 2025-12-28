/**
 * Accounting Period Close API
 *
 * POST /api/gl/periods/[id]/close - Close an accounting period (owner only)
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/gl/periods/[id]/close
 * Close an accounting period (prevents further posting)
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const period = await prisma.accountingPeriod.findUnique({
      where: { id },
    });

    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    // Check permission - requires gl:close (owner only)
    const canClose = await hasPermission(user.id, period.workspaceId, 'gl:close');
    if (!canClose) {
      return NextResponse.json(
        { error: 'Permission denied. Only workspace owner can close periods.' },
        { status: 403 }
      );
    }

    // Can only close open or locked periods
    if (period.status === 'CLOSED') {
      return NextResponse.json({ error: 'Period is already closed' }, { status: 400 });
    }

    // Check for draft entries in this period
    const draftEntries = await prisma.journalEntry.findMany({
      where: {
        workspaceId: period.workspaceId,
        status: 'DRAFT',
        entryDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
      select: { id: true, entryNumber: true, description: true },
    });

    if (draftEntries.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot close period with draft entries',
          details: {
            draftCount: draftEntries.length,
            draftEntries: draftEntries.slice(0, 10).map((e) => ({
              entryNumber: e.entryNumber,
              description: e.description,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Get posted entry count for this period
    const postedEntryCount = await prisma.journalEntry.count({
      where: {
        workspaceId: period.workspaceId,
        status: 'POSTED',
        entryDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
    });

    // Close the period
    const closed = await prisma.accountingPeriod.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: user.id,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: period.workspaceId,
        userId: user.id,
        action: 'accounting_period.close',
        entityType: 'accounting_period',
        entityId: period.id,
        newValue: {
          periodName: period.periodName,
          closedAt: closed.closedAt?.toISOString(),
          postedEntryCount,
        },
      },
    });

    return NextResponse.json({
      id: closed.id,
      periodName: closed.periodName,
      periodStart: closed.periodStart.toISOString().split('T')[0],
      periodEnd: closed.periodEnd.toISOString().split('T')[0],
      fiscalYear: closed.fiscalYear,
      status: closed.status,
      closedAt: closed.closedAt?.toISOString(),
      closedBy: closed.closedBy,
      postedEntryCount,
    });
  } catch (error) {
    console.error('Failed to close accounting period:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
