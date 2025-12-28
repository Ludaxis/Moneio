/**
 * GL Accounts Seed API
 *
 * POST /api/gl/accounts/seed - Seed default chart of accounts
 */

import { prisma, hasChartOfAccounts, seedWorkspaceChartOfAccounts } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const seedSchema = z.object({
  workspaceId: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/gl/accounts/seed
 * Seed the default chart of accounts for a workspace
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = seedSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, force } = parsed.data;

    // Check permission - requires admin level to seed accounts
    const canCreate = await hasPermission(user.id, workspaceId, 'gl:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Check if already has chart of accounts
    const hasAccounts = await hasChartOfAccounts(workspaceId);
    if (hasAccounts && !force) {
      return NextResponse.json(
        { error: 'Workspace already has a chart of accounts. Use force=true to add more.' },
        { status: 409 }
      );
    }

    // Seed the default chart of accounts
    await seedWorkspaceChartOfAccounts(workspaceId);

    // Get count of created accounts
    const count = await prisma.gLAccount.count({
      where: { workspaceId },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'gl_account.seed',
        entityType: 'workspace',
        entityId: workspaceId,
        newValue: { accountCount: count },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Seeded ${count} accounts`,
        accountCount: count,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to seed GL accounts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
