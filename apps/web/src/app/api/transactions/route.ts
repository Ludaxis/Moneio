import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serializeDecimal, serializeDecimalRequired } from '@/lib/api';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const deleteTransactionsSchema = z.object({
  workspaceId: z.string().uuid(),
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
});

interface CategorizationPayload {
  categoryId: string;
  categoryName: string;
  reason?: string;
}

/**
 * GET /api/transactions
 * List bank transactions for a workspace
 *
 * Query params:
 * - workspaceId: required UUID
 * - page: page number (default 1)
 * - pageSize: items per page (default 20, max 200)
 * - uncategorized: if 'true', only return uncategorized transactions
 * - includeSuggestions: if 'true', include pending AI suggestions
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
    const workspaceId = searchParams.get('workspaceId');
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 200);
    const uncategorized = searchParams.get('uncategorized') === 'true';
    const includeSuggestions = searchParams.get('includeSuggestions') === 'true';

    if (!workspaceId || !z.string().uuid().safeParse(workspaceId).success) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where = {
      workspaceId,
      // Filter for uncategorized transactions (no approved categorization)
      ...(uncategorized && {
        categorizations: {
          none: { approved: true },
        },
      }),
    };

    // Get transactions with category info
    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          },
          matches: {
            where: { status: 'approved' },
            take: 1,
          },
        },
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    // If includeSuggestions, fetch pending AI suggestions for these transactions
    const suggestionsMap = new Map<
      string,
      Array<{
        id: string;
        type: 'categorization' | 'match';
        confidence: number;
        suggestedCategory?: { id: string; name: string };
        matchedInvoice?: { id: string; invoiceNumber: string | null; total: number };
        rationale?: string;
      }>
    >();

    if (includeSuggestions) {
      const transactionIds = transactions.map((tx) => tx.id);

      // Fetch categorization suggestions
      const categorizationSuggestions = await prisma.aiSuggestion.findMany({
        where: {
          workspaceId,
          suggestionType: 'categorization',
          status: 'pending',
          targetId: { in: transactionIds },
        },
      });

      // Fetch match suggestions
      const matchSuggestions = await prisma.match.findMany({
        where: {
          workspaceId,
          status: 'suggested',
          transactionId: { in: transactionIds },
        },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
            },
          },
        },
      });

      // Build suggestions map
      for (const suggestion of categorizationSuggestions) {
        const payload = suggestion.payloadJson as unknown as CategorizationPayload;
        const suggestions = suggestionsMap.get(suggestion.targetId) || [];
        suggestions.push({
          id: suggestion.id,
          type: 'categorization',
          confidence: Number(suggestion.confidence || 0) * 100,
          suggestedCategory: {
            id: payload.categoryId,
            name: payload.categoryName,
          },
          rationale: payload.reason,
        });
        suggestionsMap.set(suggestion.targetId, suggestions);
      }

      for (const match of matchSuggestions) {
        const suggestions = suggestionsMap.get(match.transactionId) || [];
        suggestions.push({
          id: match.id,
          type: 'match',
          confidence: Number(match.confidence || 0) * 100,
          matchedInvoice: {
            id: match.invoice.id,
            invoiceNumber: match.invoice.invoiceNumber,
            total: Number(match.invoice.total),
          },
          rationale: match.rationale || undefined,
        });
        suggestionsMap.set(match.transactionId, suggestions);
      }
    }

    // Transform to response format
    // Note: amount/balance use strings to preserve precision for large values
    const formatted = transactions.map((tx) => ({
      id: tx.id,
      postedAt: tx.postedAt.toISOString(),
      description: tx.description,
      amount: serializeDecimalRequired(tx.amount),
      currency: tx.currency,
      balance: serializeDecimal(tx.balance),
      hasMatch: tx.matches.length > 0,
      categoryId: tx.categorizations[0]?.category.id ?? null,
      categoryName: tx.categorizations[0]?.category.name ?? null,
      ...(includeSuggestions && {
        pendingSuggestions: suggestionsMap.get(tx.id) || [],
      }),
    }));

    return NextResponse.json({
      transactions: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/transactions
 * Delete multiple transactions by ID
 */
export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteTransactionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, transactionIds } = parsed.data;

    // Check permission
    const canDelete = await hasPermission(user.id, workspaceId, 'transaction:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Delete transactions (only those belonging to this workspace)
    const result = await prisma.bankTransaction.deleteMany({
      where: {
        id: { in: transactionIds },
        workspaceId,
      },
    });

    return NextResponse.json({
      deleted: result.count,
    });
  } catch (error) {
    console.error('Failed to delete transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
