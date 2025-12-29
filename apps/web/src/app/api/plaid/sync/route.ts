/**
 * Plaid Sync API
 *
 * POST /api/plaid/sync
 *
 * Manually trigger transaction sync for a Plaid item.
 * Can sync a specific item or all items for a workspace.
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isPlaidConfigured, PlaidService } from '@/lib/plaid';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid().optional(), // If not provided, sync all items
  updateBalances: z.boolean().optional().default(true),
});

/**
 * POST /api/plaid/sync
 * Sync transactions from Plaid
 */
export async function POST(request: Request) {
  try {
    // Check if Plaid is configured
    if (!isPlaidConfigured()) {
      return NextResponse.json({ error: 'Plaid integration is not configured' }, { status: 503 });
    }

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, itemId, updateBalances } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get items to sync
    let items;
    if (itemId) {
      const item = await prisma.plaidItem.findFirst({
        where: { id: itemId, workspaceId },
      });
      if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
      items = [item];
    } else {
      items = await prisma.plaidItem.findMany({
        where: { workspaceId, status: 'active' },
      });
    }

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No connected banks to sync',
        results: [],
      });
    }

    // Sync each item
    const plaidService = new PlaidService({ prisma });
    const results = [];

    for (const item of items) {
      try {
        // Sync transactions
        const syncResult = await plaidService.syncTransactions(item.id);

        // Update balances if requested
        if (updateBalances) {
          await plaidService.updateBalances(item.id);
        }

        results.push({
          itemId: item.id,
          institutionName: item.institutionName || 'Unknown',
          success: true,
          added: syncResult.added,
          modified: syncResult.modified,
          removed: syncResult.removed,
        });
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);

        // Update item status on error
        await prisma.plaidItem.update({
          where: { id: item.id },
          data: {
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Sync failed',
          },
        });

        results.push({
          itemId: item.id,
          institutionName: item.institutionName || 'Unknown',
          success: false,
          error: error instanceof Error ? error.message : 'Sync failed',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalAdded = results.reduce((sum, r) => sum + (r.added || 0), 0);
    const totalModified = results.reduce((sum, r) => sum + (r.modified || 0), 0);
    const totalRemoved = results.reduce((sum, r) => sum + (r.removed || 0), 0);

    return NextResponse.json({
      success: successCount === results.length,
      message: `Synced ${successCount}/${results.length} bank connection(s)`,
      summary: {
        itemsProcessed: results.length,
        itemsSucceeded: successCount,
        transactionsAdded: totalAdded,
        transactionsModified: totalModified,
        transactionsRemoved: totalRemoved,
      },
      results,
    });
  } catch (error) {
    console.error('Failed to sync transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
