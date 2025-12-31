/**
 * Insights API
 *
 * GET /api/insights - Get insights for a workspace
 */

import { prisma } from '@moneio/db';
import { calculateInsightsSummary, type Insight } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  filter: z.enum(['all', 'unread', 'dismissed']).optional().default('all'),
  type: z.string().optional(),
  severity: z.enum(['info', 'warning', 'alert', 'positive']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * GET /api/insights
 * Get insights for a workspace
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
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
      filter: searchParams.get('filter') || undefined,
      type: searchParams.get('type') || undefined,
      severity: searchParams.get('severity') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, filter, type, severity, limit, offset } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where: {
      workspaceId: string;
      readAt?: { equals: null } | { not: null };
      dismissedAt?: { equals: null } | { not: null };
      type?: string;
      severity?: string;
      OR?: Array<{ expiresAt: null | { gt: Date } }>;
    } = {
      workspaceId,
    };

    // Apply filter
    switch (filter) {
      case 'unread':
        where.readAt = { equals: null };
        where.dismissedAt = { equals: null };
        break;
      case 'dismissed':
        where.dismissedAt = { not: null };
        break;
      case 'all':
      default:
        // No additional filter
        break;
    }

    // Filter out expired insights for all/unread views
    if (filter !== 'dismissed') {
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }

    // Apply optional type filter
    if (type) {
      where.type = type;
    }

    // Apply optional severity filter
    if (severity) {
      where.severity = severity;
    }

    // Get insights with pagination
    // Handle case where Insight table doesn't exist (migration not run)
    let insights: Array<{
      id: string;
      workspaceId: string;
      type: string;
      severity: string;
      title: string;
      message: string;
      data: unknown;
      actionUrl: string | null;
      actionLabel: string | null;
      createdAt: Date;
      readAt: Date | null;
      dismissedAt: Date | null;
      expiresAt: Date | null;
    }> = [];
    let totalCount = 0;
    let allInsights: typeof insights = [];

    try {
      [insights, totalCount] = await Promise.all([
        prisma.insight.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.insight.count({ where }),
      ]);

      // Get summary (for all non-dismissed insights)
      allInsights = await prisma.insight.findMany({
        where: {
          workspaceId,
          dismissedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          id: true,
          workspaceId: true,
          type: true,
          severity: true,
          title: true,
          message: true,
          data: true,
          actionUrl: true,
          actionLabel: true,
          createdAt: true,
          readAt: true,
          dismissedAt: true,
          expiresAt: true,
        },
      });
    } catch (dbError) {
      // If table doesn't exist, return empty results
      const errorMessage = String(dbError);
      if (
        errorMessage.includes('does not exist') ||
        errorMessage.includes('P2021') ||
        errorMessage.includes('relation') ||
        errorMessage.includes('Insight')
      ) {
        console.warn('Insight table not found, returning empty results');
        // Continue with empty arrays initialized above
      } else {
        throw dbError;
      }
    }

    // Convert to domain type for summary calculation
    const domainInsights: Insight[] = allInsights.map((i) => ({
      id: i.id,
      workspaceId: i.workspaceId,
      type: i.type as Insight['type'],
      severity: i.severity as Insight['severity'],
      title: i.title,
      message: i.message,
      data: (i.data as Record<string, unknown>) || {},
      actionUrl: i.actionUrl || undefined,
      actionLabel: i.actionLabel || undefined,
      createdAt: i.createdAt,
      readAt: i.readAt || undefined,
      dismissedAt: i.dismissedAt || undefined,
      expiresAt: i.expiresAt || undefined,
    }));

    const summary = calculateInsightsSummary(domainInsights);

    // Format response
    const formatted = insights.map((i) => ({
      id: i.id,
      type: i.type,
      severity: i.severity,
      title: i.title,
      message: i.message,
      data: i.data || {},
      actionUrl: i.actionUrl,
      actionLabel: i.actionLabel,
      createdAt: i.createdAt.toISOString(),
      readAt: i.readAt?.toISOString() || null,
      dismissedAt: i.dismissedAt?.toISOString() || null,
      expiresAt: i.expiresAt?.toISOString() || null,
    }));

    return NextResponse.json({
      insights: formatted,
      summary,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + insights.length < totalCount,
      },
    });
  } catch (error) {
    console.error('Failed to get insights:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
