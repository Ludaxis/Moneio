import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transactions/duplicates
 * Find duplicate transactions in a workspace
 * Duplicates are detected by: same date + same amount + similar description
 */
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
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId || !z.string().uuid().safeParse(workspaceId).success) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Find transactions with same date, amount, and description
    // Using raw SQL for the grouping query
    const duplicateGroups = await prisma.$queryRaw<
      Array<{
        posted_at: Date;
        amount: string;
        description: string | null;
        count: bigint;
        ids: string[];
      }>
    >`
      SELECT
        posted_at,
        amount::text,
        description,
        COUNT(*) as count,
        ARRAY_AGG(id::text) as ids
      FROM bank_transactions
      WHERE workspace_id = ${workspaceId}::uuid
      GROUP BY posted_at, amount, description
      HAVING COUNT(*) > 1
      ORDER BY posted_at DESC
      LIMIT 100
    `;

    // Format the response
    const duplicates = duplicateGroups.map((group) => ({
      postedAt: group.posted_at.toISOString(),
      amount: parseFloat(group.amount),
      description: group.description,
      count: Number(group.count),
      ids: group.ids,
      // Keep only the first one, rest are duplicates to remove
      keepId: group.ids[0],
      removeIds: group.ids.slice(1),
    }));

    // Calculate total duplicates to remove
    const totalDuplicates = duplicates.reduce((sum, g) => sum + g.removeIds.length, 0);
    const allRemoveIds = duplicates.flatMap((g) => g.removeIds);

    return NextResponse.json({
      groups: duplicates,
      totalGroups: duplicates.length,
      totalDuplicates,
      removeIds: allRemoveIds,
    });
  } catch (error) {
    console.error('Failed to find duplicates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/transactions/duplicates
 * Remove all duplicate transactions (keeps the first of each group)
 */
export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId || !z.string().uuid().safeParse(workspaceId).success) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check permission
    const canDelete = await hasPermission(user.id, workspaceId, 'transaction:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Find all duplicate groups
    const duplicateGroups = await prisma.$queryRaw<
      Array<{
        ids: string[];
      }>
    >`
      SELECT ARRAY_AGG(id::text) as ids
      FROM bank_transactions
      WHERE workspace_id = ${workspaceId}::uuid
      GROUP BY posted_at, amount, description
      HAVING COUNT(*) > 1
    `;

    // Get all IDs to remove (skip first in each group)
    const idsToRemove = duplicateGroups.flatMap((group) => group.ids.slice(1));

    if (idsToRemove.length === 0) {
      return NextResponse.json({ deleted: 0, message: 'No duplicates found' });
    }

    // Delete the duplicates
    const result = await prisma.bankTransaction.deleteMany({
      where: {
        id: { in: idsToRemove },
        workspaceId,
      },
    });

    return NextResponse.json({
      deleted: result.count,
      message: `Removed ${result.count} duplicate transactions`,
    });
  } catch (error) {
    console.error('Failed to delete duplicates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
