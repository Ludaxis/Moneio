/**
 * Transaction Service
 *
 * Business logic for transaction operations, extracted from API routes.
 */

import { prisma } from '@moneio/db';
import { z } from 'zod';

import { serializeDecimal, serializeDecimalRequired } from '@/lib/api';

// Schemas
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  uncategorized: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeSuggestions: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const deleteTransactionsSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
});

export type ListQueryParams = z.infer<typeof listQuerySchema>;
export type DeleteTransactionsInput = z.infer<typeof deleteTransactionsSchema>;

// Input type for direct service calls (all optional with defaults)
export interface GetTransactionsInput {
  page?: number;
  pageSize?: number;
  uncategorized?: boolean;
  includeSuggestions?: boolean;
}

interface CategorizationPayload {
  categoryId: string;
  categoryName: string;
  reason?: string;
}

/**
 * Get transactions for a workspace
 */
export async function getTransactions(workspaceId: string, params: GetTransactionsInput = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const uncategorized = params.uncategorized ?? false;
  const includeSuggestions = params.includeSuggestions ?? false;

  // Build where clause
  const where = {
    workspaceId,
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

  // If includeSuggestions, fetch pending AI suggestions
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

    const [categorizationSuggestions, matchSuggestions] = await Promise.all([
      prisma.aiSuggestion.findMany({
        where: {
          workspaceId,
          suggestionType: 'categorization',
          status: 'pending',
          targetId: { in: transactionIds },
        },
      }),
      prisma.match.findMany({
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
      }),
    ]);

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

  return {
    transactions: formatted,
    total,
    page,
    pageSize,
  };
}

/**
 * Delete transactions by IDs
 */
export async function deleteTransactions(workspaceId: string, transactionIds: string[]) {
  const result = await prisma.bankTransaction.deleteMany({
    where: {
      id: { in: transactionIds },
      workspaceId,
    },
  });

  return { deleted: result.count };
}
