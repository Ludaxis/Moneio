/**
 * Invoice Approve API
 *
 * POST /api/invoices/[id]/approve - Approve an invoice
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const approveSchema = z.object({
  workspaceId: z.string().uuid(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/invoices/[id]/approve
 * Approve an invoice (changes status from pending to approved)
 */
export async function POST(request: Request, { params }: RouteParams) {
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
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'document:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the invoice
    const invoice = await prisma.invoice.findFirst({
      where: { id, workspaceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot approve invoice with status: ${invoice.status}` },
        { status: 400 }
      );
    }

    // Update invoice status
    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: 'approved' },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'invoice.approve',
        entityType: 'invoice',
        entityId: id,
        oldValue: { status: 'pending' },
        newValue: { status: 'approved' },
      },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to approve invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
