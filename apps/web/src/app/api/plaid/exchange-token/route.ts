/**
 * Plaid Token Exchange API
 *
 * POST /api/plaid/exchange-token
 *
 * Exchanges a public token (received from Plaid Link) for an access token.
 * Creates PlaidItem and BankAccount records in the database.
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
  publicToken: z.string(),
  metadata: z
    .object({
      institutionId: z.string().optional(),
      institutionName: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/plaid/exchange-token
 * Exchange public token for access token and create accounts
 */
export async function POST(request: Request) {
  try {
    // Check if Plaid is configured
    if (!isPlaidConfigured()) {
      return NextResponse.json(
        { error: 'Plaid integration is not configured' },
        { status: 503 }
      );
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

    const { workspaceId, publicToken, metadata } = parsed.data;

    // Check permission
    const canManage = await hasPermission(user.id, workspaceId, 'workspace:manage');
    if (!canManage) {
      return NextResponse.json(
        { error: 'Permission denied. Admin access required to connect banks.' },
        { status: 403 }
      );
    }

    // Exchange token and create accounts
    const plaidService = new PlaidService({ prisma });
    const result = await plaidService.exchangePublicToken(
      workspaceId,
      publicToken,
      metadata
    );

    // Trigger initial transaction sync
    const plaidItem = await prisma.plaidItem.findUnique({
      where: { itemId: result.itemId },
    });

    if (plaidItem) {
      // Sync transactions in background
      plaidService.syncTransactions(plaidItem.id).catch((error) => {
        console.error('Initial transaction sync failed:', error);
      });
    }

    return NextResponse.json({
      success: true,
      itemId: result.itemId,
      accountCount: result.accountCount,
      message: `Successfully connected ${result.accountCount} account(s). Transactions are syncing in the background.`,
    });
  } catch (error) {
    console.error('Failed to exchange token:', error);

    // Handle Plaid-specific errors
    if (error instanceof Error && error.message.includes('INVALID_PUBLIC_TOKEN')) {
      return NextResponse.json(
        { error: 'Invalid or expired public token. Please try connecting again.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
