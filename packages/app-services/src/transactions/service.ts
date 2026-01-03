/**
 * Transaction Service - Business logic with caching
 *
 * Uses React cache() for request-scoped deduplication.
 */

import { cache } from 'react';

import type {
  TransactionListQuery,
  TransactionListDto,
  TransactionDto,
  DeleteTransactionsDto,
  SuggestionDto,
  CategorySuggestionDto,
  MatchSuggestionDto,
} from './dto';
import { TransactionRepository } from './repository';

const repository = new TransactionRepository();

interface CategorizationPayload {
  categoryId: string;
  categoryName: string;
  reason?: string;
}

/**
 * Get transactions for a workspace
 *
 * Cached per-request to avoid duplicate fetches when used in multiple components.
 */
export const getTransactions = cache(
  async (
    workspaceId: string,
    options: Omit<TransactionListQuery, 'workspaceId'>
  ): Promise<TransactionListDto> => {
    const { page = 1, pageSize = 20, uncategorized = false, includeSuggestions = false } = options;

    // Fetch transactions
    const { items, total } = await repository.findByWorkspace(workspaceId, {
      page,
      pageSize,
      uncategorized,
    });

    // Build suggestions map if requested
    const suggestionsMap = new Map<string, SuggestionDto[]>();

    if (includeSuggestions && items.length > 0) {
      const transactionIds = items.map((tx) => tx.id);

      // Fetch suggestions in parallel
      const [categorizationSuggestions, matchSuggestions] = await Promise.all([
        repository.findCategorizationSuggestions(workspaceId, transactionIds),
        repository.findMatchSuggestions(workspaceId, transactionIds),
      ]);

      // Process categorization suggestions
      for (const suggestion of categorizationSuggestions) {
        const payload = suggestion.payloadJson as CategorizationPayload;
        const confidence =
          typeof suggestion.confidence === 'number'
            ? suggestion.confidence
            : Number(suggestion.confidence?.toString() || 0);

        const dto: CategorySuggestionDto = {
          id: suggestion.id,
          type: 'categorization',
          confidence: confidence * 100,
          suggestedCategory: {
            id: payload.categoryId,
            name: payload.categoryName,
          },
          rationale: payload.reason,
        };

        const existing = suggestionsMap.get(suggestion.targetId) || [];
        existing.push(dto);
        suggestionsMap.set(suggestion.targetId, existing);
      }

      // Process match suggestions
      for (const match of matchSuggestions) {
        const confidence =
          typeof match.confidence === 'number'
            ? match.confidence
            : Number(match.confidence?.toString() || 0);

        const dto: MatchSuggestionDto = {
          id: match.id,
          type: 'match',
          confidence: confidence * 100,
          matchedInvoice: {
            id: match.invoice.id,
            invoiceNumber: match.invoice.invoiceNumber,
            total: match.invoice.total.toString(),
          },
          rationale: match.rationale || undefined,
        };

        const existing = suggestionsMap.get(match.transactionId) || [];
        existing.push(dto);
        suggestionsMap.set(match.transactionId, existing);
      }
    }

    // Map to DTOs
    const transactions: TransactionDto[] = items.map((tx) => ({
      id: tx.id,
      postedAt: tx.postedAt.toISOString(),
      description: tx.description,
      amount: tx.amount.toString(),
      currency: tx.currency,
      balance: tx.balance?.toString() ?? null,
      hasMatch: tx.matches.length > 0,
      categoryId: tx.categorizations[0]?.category.id ?? null,
      categoryName: tx.categorizations[0]?.category.name ?? null,
      ...(includeSuggestions && {
        pendingSuggestions: suggestionsMap.get(tx.id) || [],
      }),
    }));

    return {
      transactions,
      total,
      page,
      pageSize,
    };
  }
);

/**
 * Delete transactions by IDs
 */
export async function deleteTransactions(
  workspaceId: string,
  transactionIds: string[]
): Promise<DeleteTransactionsDto> {
  const deleted = await repository.deleteByIds(workspaceId, transactionIds);

  return { deleted };
}
