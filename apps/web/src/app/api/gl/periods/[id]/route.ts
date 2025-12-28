/**
 * Accounting Period API - Individual Period Operations
 *
 * GET /api/gl/periods/[id] - Get period details
 * PATCH /api/gl/periods/[id] - Update period (name only)
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  periodName: z.string().min(1).max(50).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/gl/periods/[id]
 * Get accounting period details
 */
export async function GET(_request: Request, { params }: RouteParams) {
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

    // Check permission
    const canRead = await hasPermission(user.id, period.workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get entry counts and totals for this period
    const entries = await prisma.journalEntry.findMany({
      where: {
        workspaceId: period.workspaceId,
        status: 'POSTED',
        entryDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
      include: {
        lines: true,
      },
    });

    const entryCount = entries.length;
    const totalDebits = entries.reduce(
      (sum, entry) =>
        sum + entry.lines.reduce((lineSum, line) => lineSum + Number(line.debitAmount), 0),
      0
    );
    const totalCredits = entries.reduce(
      (sum, entry) =>
        sum + entry.lines.reduce((lineSum, line) => lineSum + Number(line.creditAmount), 0),
      0
    );

    // Count draft entries
    const draftEntryCount = await prisma.journalEntry.count({
      where: {
        workspaceId: period.workspaceId,
        status: 'DRAFT',
        entryDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
    });

    return NextResponse.json({
      id: period.id,
      periodName: period.periodName,
      periodStart: period.periodStart.toISOString().split('T')[0],
      periodEnd: period.periodEnd.toISOString().split('T')[0],
      fiscalYear: period.fiscalYear,
      status: period.status,
      closedAt: period.closedAt?.toISOString() || null,
      closedBy: period.closedBy,
      statistics: {
        postedEntryCount: entryCount,
        draftEntryCount,
        totalDebits: Math.round(totalDebits * 100) / 100,
        totalCredits: Math.round(totalCredits * 100) / 100,
      },
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to get accounting period:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/gl/periods/[id]
 * Update accounting period name
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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

    // Check permission
    const canUpdate = await hasPermission(user.id, period.workspaceId, 'gl:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { periodName } = parsed.data;

    if (!periodName) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const oldValue = { periodName: period.periodName };

    // Update period
    const updated = await prisma.accountingPeriod.update({
      where: { id },
      data: { periodName },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: period.workspaceId,
        userId: user.id,
        action: 'accounting_period.update',
        entityType: 'accounting_period',
        entityId: period.id,
        oldValue,
        newValue: { periodName },
      },
    });

    return NextResponse.json({
      id: updated.id,
      periodName: updated.periodName,
      periodStart: updated.periodStart.toISOString().split('T')[0],
      periodEnd: updated.periodEnd.toISOString().split('T')[0],
      fiscalYear: updated.fiscalYear,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to update accounting period:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
