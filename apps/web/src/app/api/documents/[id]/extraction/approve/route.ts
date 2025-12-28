import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const approveExtractionSchema = z.object({
  workspaceId: z.string().uuid(),
  extractionId: z.string().uuid(),
});

/**
 * POST /api/documents/[id]/extraction/approve
 * Approve an extraction
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 64 * 1024) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = approveExtractionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { workspaceId, extractionId } = parsed.data;

    // Check permission - require document:approve permission
    const canApprove = await hasPermission(user.id, workspaceId, 'document:approve');
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
      return NextResponse.json({ error: 'Extraction already approved' }, { status: 400 });
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
