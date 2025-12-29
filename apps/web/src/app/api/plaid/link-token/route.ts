/**
 * Plaid Link Token API
 *
 * POST /api/plaid/link-token
 *
 * Creates a link token for initializing Plaid Link in the frontend.
 * The link token is short-lived and specific to the user/workspace.
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
  redirectUri: z.string().url().optional(),
});

/**
 * POST /api/plaid/link-token
 * Create a link token for Plaid Link
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

    const { workspaceId, redirectUri } = parsed.data;

    // Check permission - need admin or owner to connect banks
    const canManage = await hasPermission(user.id, workspaceId, 'workspace:manage');
    if (!canManage) {
      return NextResponse.json(
        { error: 'Permission denied. Admin access required to connect banks.' },
        { status: 403 }
      );
    }

    // Create link token
    const plaidService = new PlaidService({ prisma });
    const { linkToken, expiration } = await plaidService.createLinkToken(
      user.id,
      workspaceId,
      redirectUri
    );

    return NextResponse.json({
      linkToken,
      expiration,
    });
  } catch (error) {
    console.error('Failed to create link token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
