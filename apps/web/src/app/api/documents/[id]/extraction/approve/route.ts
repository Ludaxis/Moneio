import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

/**
 * POST /api/documents/[id]/extraction/approve
 * Approve an extraction
 */
export async function POST(
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
    const { workspaceId, extractionId } = body;

    if (!workspaceId || !extractionId) {
      return NextResponse.json(
        { error: 'workspaceId and extractionId are required' },
        { status: 400 }
      );
    }

    // Check permission - require document:approve permission
    const canApprove = await hasPermission(user.id, workspaceId, 'document:write');
    if (!canApprove) {
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
        { error: 'Extraction already approved' },
        { status: 400 }
      );
    }

    // Approve extraction
    const updated = await prisma.extraction.update({
      where: { id: extractionId },
      data: {
        approved: true,
        approvedAt: new Date(),
        approvedBy: user.id,
      },
    });

    // Also update the linked invoice status if exists
    const invoice = await prisma.invoice.findFirst({
      where: {
        documentId: params.id,
        workspaceId,
      },
    });

    if (invoice) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'approved',
        },
      });
    }

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'extraction.approve',
        entityType: 'extraction',
        entityId: extractionId,
        oldValue: { approved: false },
        newValue: { approved: true },
        metadata: {
          documentId: params.id,
          version: extraction.version,
          invoiceId: invoice?.id,
        },
      },
    });

    return NextResponse.json({ extraction: updated });
  } catch (error) {
    console.error('Failed to approve extraction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
