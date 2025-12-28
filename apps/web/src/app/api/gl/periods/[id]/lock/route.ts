/**
 * Accounting Period Lock API
 *
 * POST /api/gl/periods/[id]/lock - Lock an accounting period (admin+)
 * DELETE /api/gl/periods/[id]/lock - Unlock a locked period (admin+)
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
 * POST /api/gl/periods/[id]/lock
 * Lock an accounting period (prevents posting but can be unlocked)
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

    // Check permission - requires gl:post (admin+)
    const canPost = await hasPermission(user.id, period.workspaceId, 'gl:post');
    if (!canPost) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Can only lock open periods
    if (period.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Cannot lock period with status ${period.status}` },
        { status: 400 }
      );
    }

    // Lock the period
    const locked = await prisma.accountingPeriod.update({
      where: { id },
      data: { status: 'LOCKED' },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: period.workspaceId,
        userId: user.id,
        action: 'accounting_period.lock',
        entityType: 'accounting_period',
        entityId: period.id,
        newValue: { periodName: period.periodName },
      },
    });

    return NextResponse.json({
      id: locked.id,
      periodName: locked.periodName,
      periodStart: locked.periodStart.toISOString().split('T')[0],
      periodEnd: locked.periodEnd.toISOString().split('T')[0],
      fiscalYear: locked.fiscalYear,
      status: locked.status,
    });
  } catch (error) {
    console.error('Failed to lock accounting period:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/gl/periods/[id]/lock
 * Unlock a locked accounting period
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
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

    // Check permission - requires gl:post (admin+)
    const canPost = await hasPermission(user.id, period.workspaceId, 'gl:post');
    if (!canPost) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Can only unlock locked periods (not closed)
    if (period.status !== 'LOCKED') {
      return NextResponse.json(
        { error: `Cannot unlock period with status ${period.status}` },
        { status: 400 }
      );
    }

    // Unlock the period
    const unlocked = await prisma.accountingPeriod.update({
      where: { id },
      data: { status: 'OPEN' },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: period.workspaceId,
        userId: user.id,
        action: 'accounting_period.unlock',
        entityType: 'accounting_period',
        entityId: period.id,
        newValue: { periodName: period.periodName },
      },
    });

    return NextResponse.json({
      id: unlocked.id,
      periodName: unlocked.periodName,
      periodStart: unlocked.periodStart.toISOString().split('T')[0],
      periodEnd: unlocked.periodEnd.toISOString().split('T')[0],
      fiscalYear: unlocked.fiscalYear,
      status: unlocked.status,
    });
  } catch (error) {
    console.error('Failed to unlock accounting period:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
