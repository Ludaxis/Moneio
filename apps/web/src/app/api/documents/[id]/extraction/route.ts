import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

/**
 * PATCH /api/documents/[id]/extraction
 * Update extraction payload
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, extractionId, payload } = body;

    if (!workspaceId || !extractionId || !payload) {
      return NextResponse.json(
        { error: 'workspaceId, extractionId, and payload are required' },
        { status: 400 }
      );
    }

    // Check permission
    const canWrite = await hasPermission(user.id, workspaceId, 'document:write');
    if (!canWrite) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the extraction to verify it belongs to the document
    const extraction = await prisma.extraction.findFirst({
      where: {
        id: extractionId,
        documentId: params.id,
        document: { workspaceId },
      },
    });

    if (!extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    if (extraction.approved) {
      return NextResponse.json(
        { error: 'Cannot edit approved extraction' },
        { status: 400 }
      );
    }

    // Store old value for audit log
    const oldValue = extraction.payloadJson;

    // Update extraction
    const updated = await prisma.extraction.update({
      where: { id: extractionId },
      data: {
        payloadJson: payload,
        updatedAt: new Date(),
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'extraction.update',
        entityType: 'extraction',
        entityId: extractionId,
        oldValue: oldValue as object,
        newValue: payload as object,
        metadata: {
          documentId: params.id,
          version: extraction.version,
        },
      },
    });

    return NextResponse.json({ extraction: updated });
  } catch (error) {
    console.error('Failed to update extraction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
