/**
 * AI Suggestions API
 *
 * GET /api/suggestions - List pending AI suggestions (categorization + match)
 *
 * Aggregates suggestions from:
 * - AiSuggestion table (type: categorization)
 * - Match table (status: suggested)
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  type: z.enum(['all', 'categorization', 'match']).default('all'),
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

interface CategorizationPayload {
  categoryId: string;
  categoryName: string;
  reason?: string;
  modelInfo?: {
    provider: string;
    model: string;
  };
}

/**
 * GET /api/suggestions
 * List all pending AI suggestions for a workspace
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
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
      type: searchParams.get('type') || 'all',
      status: searchParams.get('status') || 'pending',
      minConfidence: searchParams.get('minConfidence') || undefined,
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, type, status, minConfidence, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const suggestions: Array<{
      id: string;
      type: 'categorization' | 'match';
      targetId: string;
      confidence: number;
      createdAt: string;
      transaction?: {
        id: string;
        description: string | null;
        amount: number;
        currency: string;
        postedAt: string;
      };
      suggestedCategory?: {
        id: string;
        name: string;
      };
      matchedInvoice?: {
        id: string;
        invoiceNumber: string | null;
        total: number;
        currency: string;
      };
      rationale?: string;
    }> = [];

    // Fetch categorization suggestions from AiSuggestion table
    if (type === 'all' || type === 'categorization') {
      const aiSuggestions = await prisma.aiSuggestion.findMany({
        where: {
          workspaceId,
          suggestionType: 'categorization',
          status: status,
          ...(minConfidence !== undefined && {
            confidence: { gte: minConfidence / 100 },
          }),
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get transaction details for each suggestion
      const transactionIds = aiSuggestions.map((s) => s.targetId);
      const transactions = await prisma.bankTransaction.findMany({
        where: { id: { in: transactionIds } },
        select: {
          id: true,
          description: true,
          amount: true,
          currency: true,
          postedAt: true,
        },
      });
      const txMap = new Map(transactions.map((t) => [t.id, t]));

      for (const suggestion of aiSuggestions) {
        const payload = suggestion.payloadJson as unknown as CategorizationPayload;
        const tx = txMap.get(suggestion.targetId);

        if (tx) {
          suggestions.push({
            id: suggestion.id,
            type: 'categorization',
            targetId: suggestion.targetId,
            confidence: Number(suggestion.confidence || 0) * 100,
            createdAt: suggestion.createdAt.toISOString(),
            transaction: {
              id: tx.id,
              description: tx.description,
              amount: Number(tx.amount),
              currency: tx.currency,
              postedAt: tx.postedAt.toISOString(),
            },
            suggestedCategory: {
              id: payload.categoryId,
              name: payload.categoryName,
            },
            rationale: payload.reason,
          });
        }
      }
    }

    // Fetch match suggestions from Match table
    if (type === 'all' || type === 'match') {
      const matchStatus = status === 'pending' ? 'suggested' : status;
      const matches = await prisma.match.findMany({
        where: {
          workspaceId,
          status: matchStatus,
          ...(minConfidence !== undefined && {
            confidence: { gte: minConfidence / 100 },
          }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              currency: true,
            },
          },
          transaction: {
            select: {
              id: true,
              description: true,
              amount: true,
              currency: true,
              postedAt: true,
            },
          },
        },
      });

      for (const match of matches) {
        suggestions.push({
          id: match.id,
          type: 'match',
          targetId: match.transactionId,
          confidence: Number(match.confidence || 0) * 100,
          createdAt: match.createdAt.toISOString(),
          transaction: {
            id: match.transaction.id,
            description: match.transaction.description,
            amount: Number(match.transaction.amount),
            currency: match.transaction.currency,
            postedAt: match.transaction.postedAt.toISOString(),
          },
          matchedInvoice: {
            id: match.invoice.id,
            invoiceNumber: match.invoice.invoiceNumber,
            total: Number(match.invoice.total),
            currency: match.invoice.currency,
          },
          rationale: match.rationale || undefined,
        });
      }
    }

    // Sort by confidence (highest first) then by date
    suggestions.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Calculate counts
    const counts = {
      total: suggestions.length,
      categorization: suggestions.filter((s) => s.type === 'categorization').length,
      match: suggestions.filter((s) => s.type === 'match').length,
      highConfidence: suggestions.filter((s) => s.confidence >= 80).length,
      mediumConfidence: suggestions.filter((s) => s.confidence >= 50 && s.confidence < 80).length,
      lowConfidence: suggestions.filter((s) => s.confidence < 50).length,
    };

    // Paginate
    const start = (page - 1) * pageSize;
    const paginatedSuggestions = suggestions.slice(start, start + pageSize);

    return NextResponse.json({
      suggestions: paginatedSuggestions,
      counts,
      page,
      pageSize,
      total: suggestions.length,
    });
  } catch (error) {
    console.error('Failed to get suggestions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
