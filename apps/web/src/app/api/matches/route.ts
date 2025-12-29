/**
 * Matches API
 *
 * GET /api/matches?workspaceId=xxx - List matches
 * POST /api/matches - Create match
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serializeDecimal, serializeDecimalRequired } from '@/lib/api';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  status: z.enum(['suggested', 'approved', 'rejected']).optional(),
  invoiceId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  transactionId: z.string().uuid(),
  notes: z.string().optional(),
});

/**
 * GET /api/matches
 * List matches for a workspace
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
      invoiceId: searchParams.get('invoiceId'),
      transactionId: searchParams.get('transactionId'),
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, status, invoiceId, transactionId, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where = {
      workspaceId,
      ...(status && { status }),
      ...(invoiceId && { invoiceId }),
      ...(transactionId && { transactionId }),
    };

    // Get matches with pagination
    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              currency: true,
              issueDate: true,
              status: true,
            },
          },
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
      }),
      prisma.match.count({ where }),
    ]);

    // Transform to response format
    // Note: monetary values use strings to preserve precision
    const formatted = matches.map((m) => ({
      id: m.id,
      status: m.status,
      confidence: serializeDecimal(m.confidence),
      rationale: m.rationale,
      createdAt: m.createdAt.toISOString(),
      approvedAt: m.approvedAt?.toISOString() || null,
      invoice: {
        id: m.invoice.id,
        invoiceNumber: m.invoice.invoiceNumber,
        total: serializeDecimalRequired(m.invoice.total),
        currency: m.invoice.currency,
        issueDate: m.invoice.issueDate?.toISOString().split('T')[0] || null,
        status: m.invoice.status,
      },
      transaction: {
        id: m.transaction.id,
        postedAt: m.transaction.postedAt.toISOString(),
        description: m.transaction.description,
        amount: serializeDecimalRequired(m.transaction.amount),
        currency: m.transaction.currency,
      },
    }));

    return NextResponse.json({
      matches: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get matches:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/matches
 * Create a new match manually
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, invoiceId, transactionId, notes } = parsed.data;

    // Check permission
    const canCreate = await hasPermission(user.id, workspaceId, 'transaction:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify invoice and transaction belong to workspace
    const [invoice, transaction] = await Promise.all([
      prisma.invoice.findFirst({ where: { id: invoiceId, workspaceId } }),
      prisma.bankTransaction.findFirst({ where: { id: transactionId, workspaceId } }),
    ]);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Check if match already exists
    const existing = await prisma.match.findFirst({
      where: { invoiceId, transactionId },
    });

    if (existing) {
      return NextResponse.json({ error: 'Match already exists' }, { status: 409 });
    }

    // Create match
    const match = await prisma.match.create({
      data: {
        workspaceId,
        invoiceId,
        transactionId,
        status: 'suggested',
        rationale: notes || 'Manually created match',
        confidence: 1.0, // Manual matches have full confidence
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'match.create',
        entityType: 'match',
        entityId: match.id,
        newValue: { invoiceId, transactionId },
      },
    });

    return NextResponse.json({
      id: match.id,
      status: match.status,
      createdAt: match.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to create match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
