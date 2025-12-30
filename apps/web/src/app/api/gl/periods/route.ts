/**
 * Accounting Periods API
 *
 * GET /api/gl/periods?workspaceId=xxx - List accounting periods
 * POST /api/gl/periods - Create accounting period
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const periodStatusEnum = z.enum(['OPEN', 'LOCKED', 'CLOSED']);

const listQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  fiscalYear: z.coerce.number().optional(),
  status: periodStatusEnum.optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  periodName: z.string().min(1).max(50),
  periodStart: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  periodEnd: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  fiscalYear: z.number().min(2000).max(2100),
});

/**
 * GET /api/gl/periods
 * List accounting periods for a workspace
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
      fiscalYear: searchParams.get('fiscalYear') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, fiscalYear, status, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where = {
      workspaceId,
      ...(fiscalYear && { fiscalYear }),
      ...(status && { status }),
    };

    // Get periods
    const [periods, total] = await Promise.all([
      prisma.accountingPeriod.findMany({
        where,
        orderBy: [{ fiscalYear: 'desc' }, { periodStart: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.accountingPeriod.count({ where }),
    ]);

    // Get entry counts for each period
    const periodsWithCounts = await Promise.all(
      periods.map(async (period) => {
        const entryCount = await prisma.journalEntry.count({
          where: {
            workspaceId,
            status: 'POSTED',
            entryDate: {
              gte: period.periodStart,
              lte: period.periodEnd,
            },
          },
        });

        return {
          id: period.id,
          periodName: period.periodName,
          periodStart: period.periodStart.toISOString().split('T')[0],
          periodEnd: period.periodEnd.toISOString().split('T')[0],
          fiscalYear: period.fiscalYear,
          status: period.status,
          closedAt: period.closedAt?.toISOString() || null,
          closedBy: period.closedBy,
          entryCount,
          createdAt: period.createdAt.toISOString(),
          updatedAt: period.updatedAt.toISOString(),
        };
      })
    );

    return NextResponse.json({
      periods: periodsWithCounts,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get accounting periods:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/gl/periods
 * Create a new accounting period
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

    const { workspaceId, periodName, periodStart, periodEnd, fiscalYear } = parsed.data;

    // Check permission - requires admin to create periods
    const canCreate = await hasPermission(user.id, workspaceId, 'gl:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    // Validate dates
    if (startDate >= endDate) {
      return NextResponse.json(
        { error: 'Period start must be before period end' },
        { status: 400 }
      );
    }

    // Check for overlapping periods
    const overlapping = await prisma.accountingPeriod.findFirst({
      where: {
        workspaceId,
        OR: [
          {
            periodStart: { lte: endDate },
            periodEnd: { gte: startDate },
          },
        ],
      },
    });

    if (overlapping) {
      return NextResponse.json(
        {
          error: 'Period overlaps with existing period',
          details: { overlappingPeriod: overlapping.periodName },
        },
        { status: 409 }
      );
    }

    // Create period
    const period = await prisma.accountingPeriod.create({
      data: {
        workspaceId,
        periodName,
        periodStart: startDate,
        periodEnd: endDate,
        fiscalYear,
        status: 'OPEN',
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'accounting_period.create',
        entityType: 'accounting_period',
        entityId: period.id,
        newValue: { periodName, periodStart, periodEnd, fiscalYear },
      },
    });

    return NextResponse.json(
      {
        id: period.id,
        periodName: period.periodName,
        periodStart: period.periodStart.toISOString().split('T')[0],
        periodEnd: period.periodEnd.toISOString().split('T')[0],
        fiscalYear: period.fiscalYear,
        status: period.status,
        createdAt: period.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create accounting period:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
