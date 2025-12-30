/**
 * GL Accounts API (Chart of Accounts)
 *
 * GET /api/gl/accounts?workspaceId=xxx - List accounts
 * POST /api/gl/accounts - Create account
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const accountTypeEnum = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']);
const normalBalanceEnum = z.enum(['DEBIT', 'CREDIT']);

const listQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  accountType: accountTypeEnum.optional(),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(100),
});

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  accountCode: z.string().min(1).max(20),
  accountName: z.string().min(1).max(255),
  accountType: accountTypeEnum,
  subType: z.string().max(50).optional(),
  normalBalance: normalBalanceEnum,
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/gl/accounts
 * List GL accounts for a workspace
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
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
      accountType: searchParams.get('accountType') || undefined,
      parentId: searchParams.get('parentId') || undefined,
      isActive: searchParams.get('isActive') || undefined,
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, accountType, parentId, isActive, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where = {
      workspaceId,
      ...(accountType && { accountType }),
      ...(parentId !== undefined && { parentId }),
      ...(isActive !== undefined && { isActive }),
    };

    // Get accounts with counts
    const [accounts, total] = await Promise.all([
      prisma.gLAccount.findMany({
        where,
        orderBy: [{ accountCode: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          parent: {
            select: { id: true, accountCode: true, accountName: true },
          },
          _count: {
            select: { children: true, journalLines: true },
          },
        },
      }),
      prisma.gLAccount.count({ where }),
    ]);

    // Transform to response format
    const formatted = accounts.map((acc) => ({
      id: acc.id,
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      accountType: acc.accountType,
      subType: acc.subType,
      normalBalance: acc.normalBalance,
      parentId: acc.parentId,
      parent: acc.parent
        ? {
            id: acc.parent.id,
            accountCode: acc.parent.accountCode,
            accountName: acc.parent.accountName,
          }
        : null,
      description: acc.description,
      isActive: acc.isActive,
      isSystem: acc.isSystem,
      childCount: acc._count.children,
      journalLineCount: acc._count.journalLines,
      createdAt: acc.createdAt.toISOString(),
      updatedAt: acc.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      accounts: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get GL accounts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/gl/accounts
 * Create a new GL account
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
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      workspaceId,
      accountCode,
      accountName,
      accountType,
      subType,
      normalBalance,
      parentId,
      description,
    } = parsed.data;

    // Check permission
    const canCreate = await hasPermission(user.id, workspaceId, 'gl:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Check if account code already exists
    const existing = await prisma.gLAccount.findFirst({
      where: { workspaceId, accountCode },
    });
    if (existing) {
      return NextResponse.json({ error: 'Account code already exists' }, { status: 409 });
    }

    // Check if parent exists (if specified)
    if (parentId) {
      const parent = await prisma.gLAccount.findFirst({
        where: { id: parentId, workspaceId },
      });
      if (!parent) {
        return NextResponse.json({ error: 'Parent account not found' }, { status: 400 });
      }
      // Parent must be same account type
      if (parent.accountType !== accountType) {
        return NextResponse.json(
          { error: 'Parent account must be the same account type' },
          { status: 400 }
        );
      }
    }

    // Create account
    const account = await prisma.gLAccount.create({
      data: {
        workspaceId,
        accountCode,
        accountName,
        accountType,
        subType: subType || null,
        normalBalance,
        parentId: parentId || null,
        description: description || null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'gl_account.create',
        entityType: 'gl_account',
        entityId: account.id,
        newValue: { accountCode, accountName, accountType, normalBalance, parentId },
      },
    });

    return NextResponse.json(
      {
        id: account.id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        subType: account.subType,
        normalBalance: account.normalBalance,
        parentId: account.parentId,
        description: account.description,
        isActive: account.isActive,
        isSystem: account.isSystem,
        createdAt: account.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create GL account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
