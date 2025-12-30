/**
 * Rules API
 *
 * GET /api/rules?workspaceId=xxx - List rules
 * POST /api/rules - Create rule
 */

import { prisma } from '@moneio/db';
import { createRuleSchema, ruleConditionsSchema } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

/**
 * GET /api/rules
 * List rules for a workspace
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
      categoryId: searchParams.get('categoryId') || undefined,
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

    const { workspaceId, categoryId, isActive, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'rule:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where = {
      workspaceId,
      ...(categoryId && { categoryId }),
      ...(isActive !== undefined && { isActive }),
    };

    // Get rules with pagination
    const [rules, total] = await Promise.all([
      prisma.rule.findMany({
        where,
        orderBy: { priority: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.rule.count({ where }),
    ]);

    // Transform to response format
    const formatted = rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      conditions: rule.conditions,
      priority: rule.priority,
      isActive: rule.isActive,
      category: rule.category ? { id: rule.category.id, name: rule.category.name } : null,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      rules: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get rules:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/rules
 * Create a new rule
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
    const parsed = createRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, categoryId, name, conditions, priority, isActive } = parsed.data;

    // Check permission
    const canCreate = await hasPermission(user.id, workspaceId, 'rule:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify category exists
    const category = await prisma.category.findFirst({
      where: { id: categoryId, workspaceId },
    });
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 400 });
    }

    // Validate conditions structure
    const conditionsValid = ruleConditionsSchema.safeParse(conditions);
    if (!conditionsValid.success) {
      return NextResponse.json(
        { error: 'Invalid conditions format', details: conditionsValid.error.flatten() },
        { status: 400 }
      );
    }

    // Create rule
    const rule = await prisma.rule.create({
      data: {
        workspaceId,
        categoryId,
        name,
        conditions,
        priority,
        isActive,
      },
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
        action: 'rule.create',
        entityType: 'rule',
        entityId: rule.id,
        newValue: { name, categoryId, priority, isActive },
      },
    });

    return NextResponse.json(
      {
        id: rule.id,
        name: rule.name,
        conditions: rule.conditions,
        priority: rule.priority,
        isActive: rule.isActive,
        category: rule.category,
        createdAt: rule.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
