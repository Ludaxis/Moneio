/**
 * Dismiss Insight API
 *
 * POST /api/insights/[id]/dismiss - Dismiss an insight
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

/**
 * POST /api/insights/[id]/dismiss
 * Dismiss an insight (hide from view)
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the insight to check workspace permission
    const insight = await prisma.insight.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, dismissedAt: true },
    });

    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    // Check permission
    const canUpdate = await hasPermission(user.id, insight.workspaceId, 'transaction:read');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Mark as dismissed if not already
    if (!insight.dismissedAt) {
      await prisma.insight.update({
        where: { id },
        data: { dismissedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to dismiss insight:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
