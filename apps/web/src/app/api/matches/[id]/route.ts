/**
 * Match Detail API
 *
 * GET /api/matches/[id] - Get match by ID
 * PATCH /api/matches/[id] - Update match (approve/reject)
 * DELETE /api/matches/[id] - Delete match
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/matches/[id]
 * Get match details
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
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const match = await prisma.match.findFirst({
      where: { id, workspaceId },
      include: {
        invoice: {
          include: {
            lineItems: { orderBy: { sortOrder: 'asc' } },
            merchant: { select: { id: true, name: true } },
          },
        },
        transaction: true,
      },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: match.id,
      status: match.status,
      confidence: match.confidence?.toNumber() || null,
      rationale: match.rationale,
      createdAt: match.createdAt.toISOString(),
      approvedAt: match.approvedAt?.toISOString() || null,
      approvedBy: match.approvedBy,
      invoice: {
        id: match.invoice.id,
        invoiceNumber: match.invoice.invoiceNumber,
        issueDate: match.invoice.issueDate?.toISOString().split('T')[0] || null,
        dueDate: match.invoice.dueDate?.toISOString().split('T')[0] || null,
        currency: match.invoice.currency,
        subtotal: match.invoice.subtotal.toNumber(),
        vatAmount: match.invoice.vatAmount.toNumber(),
        total: match.invoice.total.toNumber(),
        status: match.invoice.status,
        merchant: match.invoice.merchant
          ? { id: match.invoice.merchant.id, name: match.invoice.merchant.name }
          : null,
        lineItems: match.invoice.lineItems.map((li) => ({
          id: li.id,
          description: li.description,
          quantity: li.quantity.toNumber(),
          unitPrice: li.unitPrice.toNumber(),
          amount: li.amount.toNumber(),
        })),
      },
      transaction: {
        id: match.transaction.id,
        postedAt: match.transaction.postedAt.toISOString(),
        description: match.transaction.description,
        amount: match.transaction.amount.toNumber(),
        currency: match.transaction.currency,
        balance: match.transaction.balance?.toNumber() || null,
      },
    });
  } catch (error) {
    console.error('Failed to get match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/matches/[id]
 * Update match status (approve or reject)
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
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, status } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'transaction:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the match
    const match = await prisma.match.findFirst({
      where: { id, workspaceId },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (match.status !== 'suggested') {
      return NextResponse.json(
        { error: `Cannot update match with status: ${match.status}` },
        { status: 400 }
      );
    }

    // Update match
    const updated = await prisma.match.update({
      where: { id },
      data: {
        status,
        approvedAt: new Date(),
        approvedBy: user.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: status === 'approved' ? 'match.approve' : 'match.reject',
        entityType: 'match',
        entityId: id,
        oldValue: { status: 'suggested' },
        newValue: { status },
        metadata: {
          invoiceId: match.invoiceId,
          transactionId: match.transactionId,
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      approvedAt: updated.approvedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('Failed to update match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/matches/[id]
 * Delete match
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
    const canDelete = await hasPermission(user.id, workspaceId, 'transaction:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the match
    const match = await prisma.match.findFirst({
      where: { id, workspaceId },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Delete match
    await prisma.match.delete({ where: { id } });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'match.delete',
        entityType: 'match',
        entityId: id,
        oldValue: {
          invoiceId: match.invoiceId,
          transactionId: match.transactionId,
          status: match.status,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
