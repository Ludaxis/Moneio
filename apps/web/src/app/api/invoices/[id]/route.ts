/**
 * Invoice Detail API
 *
 * GET /api/invoices/[id] - Get invoice by ID
 * PATCH /api/invoices/[id] - Update invoice
 * DELETE /api/invoices/[id] - Delete invoice
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serializeDecimal, serializeDecimalRequired } from '@/lib/api';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  invoiceNumber: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['pending', 'approved', 'paid', 'void']).optional(),
  merchantId: z.string().uuid().nullable().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/invoices/[id]
 * Get invoice details
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
    const canRead = await hasPermission(user.id, workspaceId, 'document:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        workspaceId,
      },
      include: {
        merchant: {
          select: { id: true, name: true },
        },
        document: {
          select: { id: true, fileName: true },
        },
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
        matches: {
          include: {
            transaction: {
              select: {
                id: true,
                postedAt: true,
                description: true,
                amount: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Type assertion to access included relations
    const inv = invoice as typeof invoice & {
      merchant: { id: string; name: string } | null;
      document: { id: string; fileName: string } | null;
      lineItems: Array<{
        id: string;
        description: string | null;
        quantity: { toNumber: () => number };
        unitPrice: { toNumber: () => number };
        amount: { toNumber: () => number };
        vatRate: { toNumber: () => number } | null;
      }>;
      matches: Array<{
        id: string;
        status: string;
        confidence: { toNumber: () => number } | null;
        rationale: string | null;
        transaction: {
          id: string;
          postedAt: Date;
          description: string | null;
          amount: { toNumber: () => number };
          currency: string;
        };
      }>;
    };

    // Note: monetary values use strings to preserve precision
    return NextResponse.json({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate?.toISOString().split('T')[0] || null,
      dueDate: inv.dueDate?.toISOString().split('T')[0] || null,
      currency: inv.currency,
      subtotal: serializeDecimalRequired(inv.subtotal),
      vatAmount: serializeDecimalRequired(inv.vatAmount),
      total: serializeDecimalRequired(inv.total),
      vatRate: serializeDecimal(inv.vatRate),
      status: inv.status,
      merchant: inv.merchant ? { id: inv.merchant.id, name: inv.merchant.name } : null,
      document: inv.document ? { id: inv.document.id, fileName: inv.document.fileName } : null,
      lineItems: inv.lineItems.map((li) => ({
        id: li.id,
        description: li.description,
        quantity: serializeDecimalRequired(li.quantity),
        unitPrice: serializeDecimalRequired(li.unitPrice),
        amount: serializeDecimalRequired(li.amount),
        vatRate: serializeDecimal(li.vatRate),
      })),
      matches: inv.matches.map((m) => ({
        id: m.id,
        status: m.status,
        confidence: serializeDecimal(m.confidence),
        rationale: m.rationale,
        transaction: {
          id: m.transaction.id,
          postedAt: m.transaction.postedAt.toISOString(),
          description: m.transaction.description,
          amount: serializeDecimalRequired(m.transaction.amount),
          currency: m.transaction.currency,
        },
      })),
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to get invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/invoices/[id]
 * Update invoice
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

    const { workspaceId, ...updates } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'document:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify invoice belongs to workspace
    const existing = await prisma.invoice.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (updates.invoiceNumber !== undefined) updateData.invoiceNumber = updates.invoiceNumber;
    if (updates.issueDate !== undefined) updateData.issueDate = new Date(updates.issueDate);
    if (updates.dueDate !== undefined) updateData.dueDate = new Date(updates.dueDate);
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.merchantId !== undefined) updateData.merchantId = updates.merchantId;

    const updated = await prisma.invoice.update({
      where: { id },
      data: updateData,
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'invoice.update',
        entityType: 'invoice',
        entityId: id,
        oldValue: { status: existing.status, invoiceNumber: existing.invoiceNumber },
        newValue: updates,
      },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to update invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/invoices/[id]
 * Delete invoice
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
    const canDelete = await hasPermission(user.id, workspaceId, 'document:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify invoice belongs to workspace
    const existing = await prisma.invoice.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Delete invoice (cascades to line items and matches)
    await prisma.invoice.delete({
      where: { id },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'invoice.delete',
        entityType: 'invoice',
        entityId: id,
        oldValue: { invoiceNumber: existing.invoiceNumber, total: existing.total.toString() },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
