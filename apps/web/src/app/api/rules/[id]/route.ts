/**
 * Rule Detail API
 *
 * GET /api/rules/[id]?workspaceId=xxx - Get rule
 * PATCH /api/rules/[id] - Update rule
 * DELETE /api/rules/[id]?workspaceId=xxx - Delete rule
 */

import { prisma } from '@moneio/db';
import { ruleConditionsSchema, updateRuleSchema } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/rules/[id]
 * Get a single rule with details
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
    const canRead = await hasPermission(user.id, workspaceId, 'rule:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get rule
    const rule = await prisma.rule.findFirst({
      where: { id, workspaceId },
      include: {
        category: {
          select: { id: true, name: true, parentId: true },
        },
      },
    });

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: rule.id,
      name: rule.name,
      conditions: rule.conditions,
      priority: rule.priority,
      isActive: rule.isActive,
      category: rule.category,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to get rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/rules/[id]
 * Update a rule
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
    const parsed = updateRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, categoryId, name, conditions, priority, isActive } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'rule:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify rule exists
    const existing = await prisma.rule.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Verify category if changing
    if (categoryId && categoryId !== existing.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, workspaceId },
      });
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 400 });
      }
    }

    // Validate conditions if provided
    if (conditions) {
      const conditionsValid = ruleConditionsSchema.safeParse(conditions);
      if (!conditionsValid.success) {
        return NextResponse.json(
          { error: 'Invalid conditions format', details: conditionsValid.error.flatten() },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (name !== undefined) updateData.name = name;
    if (conditions !== undefined) updateData.conditions = conditions;
    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Update rule
    const updated = await prisma.rule.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'rule.update',
        entityType: 'rule',
        entityId: id,
        oldValue: {
          name: existing.name,
          categoryId: existing.categoryId,
          priority: existing.priority,
          isActive: existing.isActive,
        },
        newValue: updateData as Record<string, string | number | boolean | null | object>,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      conditions: updated.conditions,
      priority: updated.priority,
      isActive: updated.isActive,
      category: updated.category,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to update rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/rules/[id]
 * Delete a rule
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
    const canDelete = await hasPermission(user.id, workspaceId, 'rule:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify rule exists
    const existing = await prisma.rule.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Delete rule
    await prisma.rule.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'rule.delete',
        entityType: 'rule',
        entityId: id,
        oldValue: { name: existing.name, categoryId: existing.categoryId },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
