/**
 * Categories API
 *
 * GET /api/categories?workspaceId=xxx - List categories
 * POST /api/categories - Create category
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional(),
  taxCode: z.string().max(20).optional(),
  glAccountId: z.string().uuid().nullable().optional(),
});

/**
 * GET /api/categories
 * List categories for a workspace with hierarchy info
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
      parentId: searchParams.get('parentId') || undefined,
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, parentId, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'category:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where = {
      workspaceId,
      ...(parentId !== undefined && { parentId }),
    };

    // Get categories with counts
    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          parent: {
            select: { id: true, name: true },
          },
          glAccount: {
            select: { id: true, accountCode: true, accountName: true, accountType: true },
          },
          _count: {
            select: { children: true, rules: true, categorizations: true },
          },
        },
      }),
      prisma.category.count({ where }),
    ]);

    // Transform to response format
    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      parent: cat.parent ? { id: cat.parent.id, name: cat.parent.name } : null,
      taxCode: cat.taxCode,
      glAccountId: cat.glAccountId,
      glAccount: cat.glAccount
        ? {
            id: cat.glAccount.id,
            accountCode: cat.glAccount.accountCode,
            accountName: cat.glAccount.accountName,
            accountType: cat.glAccount.accountType,
          }
        : null,
      isSystem: cat.isSystem,
      childCount: cat._count.children,
      ruleCount: cat._count.rules,
      transactionCount: cat._count.categorizations,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      categories: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/categories
 * Create a new category
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

    const { workspaceId, name, parentId, taxCode, glAccountId } = parsed.data;

    // Check permission
    const canCreate = await hasPermission(user.id, workspaceId, 'category:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Check if parent exists (if specified)
    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId, workspaceId },
      });
      if (!parent) {
        return NextResponse.json({ error: 'Parent category not found' }, { status: 400 });
      }
    }

    // Check for duplicate name in workspace
    const existing = await prisma.category.findFirst({
      where: { workspaceId, name },
    });
    if (existing) {
      return NextResponse.json({ error: 'Category name already exists' }, { status: 409 });
    }

    // Validate GL account exists (if specified)
    if (glAccountId) {
      const glAccount = await prisma.gLAccount.findFirst({
        where: { id: glAccountId, workspaceId },
      });
      if (!glAccount) {
        return NextResponse.json({ error: 'GL account not found' }, { status: 400 });
      }
    }

    // Create category
    const category = await prisma.category.create({
      data: {
        workspaceId,
        name,
        parentId: parentId || null,
        taxCode: taxCode || null,
        glAccountId: glAccountId || null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'category.create',
        entityType: 'category',
        entityId: category.id,
        newValue: { name, parentId, taxCode, glAccountId },
      },
    });

    return NextResponse.json(
      {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        taxCode: category.taxCode,
        glAccountId: category.glAccountId,
        isSystem: category.isSystem,
        createdAt: category.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create category:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
