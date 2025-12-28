/**
 * Category Detail API
 *
 * GET /api/categories/[id]?workspaceId=xxx - Get category
 * PATCH /api/categories/[id] - Update category
 * DELETE /api/categories/[id]?workspaceId=xxx - Delete category
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
  taxCode: z.string().max(20).nullable().optional(),
});

/**
 * GET /api/categories/[id]
 * Get a single category with details
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

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
    const canRead = await hasPermission(user.id, workspaceId, 'category:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get category with related data
    const category = await prisma.category.findFirst({
      where: { id, workspaceId },
      include: {
        parent: {
          select: { id: true, name: true },
        },
        children: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
        rules: {
          select: { id: true, name: true, isActive: true, priority: true },
          orderBy: { priority: 'desc' },
        },
        _count: {
          select: { categorizations: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      parent: category.parent,
      taxCode: category.taxCode,
      isSystem: category.isSystem,
      children: category.children,
      rules: category.rules,
      transactionCount: category._count.categorizations,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to get category:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/categories/[id]
 * Update a category
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

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, name, parentId, taxCode } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'category:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify category exists
    const existing = await prisma.category.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Prevent editing system categories
    if (existing.isSystem) {
      return NextResponse.json({ error: 'Cannot modify system category' }, { status: 403 });
    }

    // Check for duplicate name if changing
    if (name && name !== existing.name) {
      const duplicate = await prisma.category.findFirst({
        where: { workspaceId, name, id: { not: id } },
      });
      if (duplicate) {
        return NextResponse.json({ error: 'Category name already exists' }, { status: 409 });
      }
    }

    // Validate parent if changing
    if (parentId !== undefined && parentId !== existing.parentId) {
      if (parentId) {
        // Can't be parent of itself
        if (parentId === id) {
          return NextResponse.json({ error: 'Category cannot be its own parent' }, { status: 400 });
        }
        const parent = await prisma.category.findFirst({
          where: { id: parentId, workspaceId },
        });
        if (!parent) {
          return NextResponse.json({ error: 'Parent category not found' }, { status: 400 });
        }
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (parentId !== undefined) updateData.parentId = parentId;
    if (taxCode !== undefined) updateData.taxCode = taxCode;

    // Update category
    const updated = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'category.update',
        entityType: 'category',
        entityId: id,
        oldValue: { name: existing.name, parentId: existing.parentId, taxCode: existing.taxCode },
        newValue: updateData as Record<string, string | number | boolean | null>,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      parentId: updated.parentId,
      taxCode: updated.taxCode,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to update category:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/categories/[id]
 * Delete a category
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

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
    const canDelete = await hasPermission(user.id, workspaceId, 'category:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify category exists
    const existing = await prisma.category.findFirst({
      where: { id, workspaceId },
      include: {
        _count: {
          select: { children: true, rules: true, categorizations: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Prevent deleting system categories
    if (existing.isSystem) {
      return NextResponse.json({ error: 'Cannot delete system category' }, { status: 403 });
    }

    // Check if category has children
    if (existing._count.children > 0) {
      return NextResponse.json(
        { error: 'Cannot delete category with subcategories' },
        { status: 400 }
      );
    }

    // Check if category has rules
    if (existing._count.rules > 0) {
      return NextResponse.json({ error: 'Cannot delete category with rules' }, { status: 400 });
    }

    // Delete category (categorizations will be cascade deleted)
    await prisma.category.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'category.delete',
        entityType: 'category',
        entityId: id,
        oldValue: { name: existing.name },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete category:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
