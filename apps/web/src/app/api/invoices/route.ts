/**
 * Invoices API
 *
 * GET /api/invoices?workspaceId=xxx - List invoices
 * POST /api/invoices - Create invoice
 */

import type { InvoiceLineItem } from '@moneio/db';
import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serializeDecimal, serializeDecimalRequired } from '@/lib/api';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  status: z.enum(['pending', 'approved', 'paid', 'void']).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

/**
 * GET /api/invoices
 * List invoices for a workspace
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

    const { workspaceId, status, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'document:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where = {
      workspaceId,
      ...(status && { status }),
    };

    // Get invoices with pagination
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
            where: { status: 'approved' },
            take: 1,
          },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    // Transform to response format
    // Note: monetary values use strings to preserve precision
    const formatted = invoices.map((inv) => ({
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
      lineItems: inv.lineItems.map((li: InvoiceLineItem) => ({
        id: li.id,
        description: li.description,
        quantity: serializeDecimalRequired(li.quantity),
        unitPrice: serializeDecimalRequired(li.unitPrice),
        amount: serializeDecimalRequired(li.amount),
        vatRate: serializeDecimal(li.vatRate),
      })),
      hasMatch: inv.matches.length > 0,
      createdAt: inv.createdAt.toISOString(),
    }));

    return NextResponse.json({
      invoices: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get invoices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
