/**
 * GL Account API - Individual Account Operations
 *
 * GET /api/gl/accounts/[id] - Get account details
 * PATCH /api/gl/accounts/[id] - Update account
 * DELETE /api/gl/accounts/[id] - Delete account
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  accountName: z.string().min(1).max(255).optional(),
  subType: z.string().max(50).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/gl/accounts/[id]
 * Get account details with children
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

    const account = await prisma.gLAccount.findUnique({
      where: { id },
      include: {
        parent: {
          select: { id: true, accountCode: true, accountName: true },
        },
        children: {
          select: {
            id: true,
            accountCode: true,
            accountName: true,
            accountType: true,
            isActive: true,
          },
          orderBy: { accountCode: 'asc' },
        },
        _count: {
          select: { journalLines: true, balances: true },
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, account.workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    return NextResponse.json({
      id: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      subType: account.subType,
      normalBalance: account.normalBalance,
      parentId: account.parentId,
      parent: account.parent,
      children: account.children,
      description: account.description,
      isActive: account.isActive,
      isSystem: account.isSystem,
      journalLineCount: account._count.journalLines,
      balanceCount: account._count.balances,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to get GL account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/gl/accounts/[id]
 * Update account properties
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

    const account = await prisma.gLAccount.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check permission
    const canUpdate = await hasPermission(user.id, account.workspaceId, 'gl:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Cannot modify system accounts
    if (account.isSystem) {
      return NextResponse.json({ error: 'Cannot modify system account' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { accountName, subType, parentId, description, isActive } = parsed.data;

    // If changing parent, validate it exists and is same type
    if (parentId !== undefined && parentId !== null) {
      const parent = await prisma.gLAccount.findFirst({
        where: { id: parentId, workspaceId: account.workspaceId },
      });
      if (!parent) {
        return NextResponse.json({ error: 'Parent account not found' }, { status: 400 });
      }
      if (parent.accountType !== account.accountType) {
        return NextResponse.json(
          { error: 'Parent account must be the same account type' },
          { status: 400 }
        );
      }
      // Cannot set parent to self or descendant
      if (parent.id === account.id) {
        return NextResponse.json({ error: 'Cannot set parent to self' }, { status: 400 });
      }
    }

    // Cannot deactivate account with journal lines
    if (isActive === false) {
      const journalLineCount = await prisma.journalLine.count({
        where: { glAccountId: id },
      });
      if (journalLineCount > 0) {
        return NextResponse.json(
          { error: 'Cannot deactivate account with journal entries' },
          { status: 400 }
        );
      }
    }

    const oldValue = {
      accountName: account.accountName,
      subType: account.subType,
      parentId: account.parentId,
      description: account.description,
      isActive: account.isActive,
    };

    // Update account
    const updated = await prisma.gLAccount.update({
      where: { id },
      data: {
        ...(accountName !== undefined && { accountName }),
        ...(subType !== undefined && { subType }),
        ...(parentId !== undefined && { parentId }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: account.workspaceId,
        userId: user.id,
        action: 'gl_account.update',
        entityType: 'gl_account',
        entityId: account.id,
        oldValue,
        newValue: { accountName, subType, parentId, description, isActive },
      },
    });

    return NextResponse.json({
      id: updated.id,
      accountCode: updated.accountCode,
      accountName: updated.accountName,
      accountType: updated.accountType,
      subType: updated.subType,
      normalBalance: updated.normalBalance,
      parentId: updated.parentId,
      description: updated.description,
      isActive: updated.isActive,
      isSystem: updated.isSystem,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to update GL account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/gl/accounts/[id]
 * Delete an account (only if no journal lines)
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

    const account = await prisma.gLAccount.findUnique({
      where: { id },
      include: {
        _count: {
          select: { children: true, journalLines: true },
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check permission
    const canDelete = await hasPermission(user.id, account.workspaceId, 'gl:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Cannot delete system accounts
    if (account.isSystem) {
      return NextResponse.json({ error: 'Cannot delete system account' }, { status: 403 });
    }

    // Cannot delete account with children
    if (account._count.children > 0) {
      return NextResponse.json(
        { error: 'Cannot delete account with child accounts' },
        { status: 400 }
      );
    }

    // Cannot delete account with journal lines
    if (account._count.journalLines > 0) {
      return NextResponse.json(
        { error: 'Cannot delete account with journal entries' },
        { status: 400 }
      );
    }

    // Delete account
    await prisma.gLAccount.delete({
      where: { id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: account.workspaceId,
        userId: user.id,
        action: 'gl_account.delete',
        entityType: 'gl_account',
        entityId: account.id,
        oldValue: {
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete GL account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
