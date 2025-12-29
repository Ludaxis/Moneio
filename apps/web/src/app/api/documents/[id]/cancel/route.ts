/**
 * POST /api/documents/[id]/cancel
 *
 * Cancel/reset a stuck document processing job
 * Sets status back to 'uploaded' or 'failed' so it can be retried
 */

import { prisma, DocumentStatus } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum(['cancel', 'retry']).default('cancel'),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, action } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'document:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the document
    const document = await prisma.document.findFirst({
      where: {
        id: params.id,
        workspaceId,
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Determine new status based on action
    const newStatus = action === 'retry' ? DocumentStatus.uploaded : DocumentStatus.failed;
    const failReason = action === 'cancel' ? 'Processing cancelled by user' : null;

    // Update the document status
    const updated = await prisma.document.update({
      where: { id: params.id },
      data: {
        status: newStatus,
        failReason,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: action === 'cancel' ? 'document.cancel' : 'document.retry',
        entityType: 'document',
        entityId: document.id,
        newValue: { status: newStatus },
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error('Failed to cancel document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
