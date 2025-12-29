/**
 * Plaid Items API
 *
 * GET /api/plaid/items?workspaceId=xxx
 * DELETE /api/plaid/items?workspaceId=xxx&itemId=xxx
 *
 * List and manage connected bank institutions.
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { PlaidService } from '@/lib/plaid';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const getQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

const deleteQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
});

/**
 * GET /api/plaid/items
 * List all connected Plaid items for a workspace
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
    const parsed = getQuerySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get items
    const plaidService = new PlaidService({ prisma });
    const items = await plaidService.getItems(workspaceId);

    // Format response
    const formattedItems = items.map((item) => ({
      id: item.id,
      institutionName: item.institutionName || 'Unknown Institution',
      institutionId: item.institutionId,
      status: item.status,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      lastSyncedAt: item.lastSyncedAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
      accounts: item.bankAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        officialName: account.officialName,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
        currency: account.currency,
        currentBalance: account.currentBalance?.toNumber() || null,
        availableBalance: account.availableBalance?.toNumber() || null,
      })),
    }));

    return NextResponse.json({
      items: formattedItems,
      totalAccounts: formattedItems.reduce((sum, item) => sum + item.accounts.length, 0),
    });
  } catch (error) {
    console.error('Failed to get Plaid items:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/plaid/items
 * Disconnect a Plaid item
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
    const parsed = deleteQuerySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
      itemId: searchParams.get('itemId'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, itemId } = parsed.data;

    // Check permission - need admin to disconnect banks
    const canManage = await hasPermission(user.id, workspaceId, 'workspace:manage');
    if (!canManage) {
      return NextResponse.json(
        { error: 'Permission denied. Admin access required to disconnect banks.' },
        { status: 403 }
      );
    }

    // Verify item belongs to workspace
    const item = await prisma.plaidItem.findFirst({
      where: { id: itemId, workspaceId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Remove item
    const plaidService = new PlaidService({ prisma });
    await plaidService.removeItem(itemId);

    return NextResponse.json({
      success: true,
      message: 'Bank disconnected successfully',
    });
  } catch (error) {
    console.error('Failed to delete Plaid item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
