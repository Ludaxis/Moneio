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
      status: searchParams.get('status'),
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
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
    const formatted = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate?.toISOString().split('T')[0] || null,
      dueDate: inv.dueDate?.toISOString().split('T')[0] || null,
      currency: inv.currency,
      subtotal: inv.subtotal.toNumber(),
      vatAmount: inv.vatAmount.toNumber(),
      total: inv.total.toNumber(),
      vatRate: inv.vatRate?.toNumber() || null,
      status: inv.status,
      merchant: inv.merchant ? { id: inv.merchant.id, name: inv.merchant.name } : null,
      document: inv.document ? { id: inv.document.id, fileName: inv.document.fileName } : null,
      lineItems: inv.lineItems.map((li: InvoiceLineItem) => ({
        id: li.id,
        description: li.description,
        quantity: li.quantity.toNumber(),
        unitPrice: li.unitPrice.toNumber(),
        amount: li.amount.toNumber(),
        vatRate: li.vatRate?.toNumber() || null,
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
