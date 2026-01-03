/**
 * Transaction DTOs - API response types
 *
 * These types define what the API returns, separate from Prisma models.
 */

import { z } from 'zod';

// Query parameters schema
export const transactionListQuerySchema = z.object({
  workspaceId: z.string().uuid(),
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

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

// Delete request schema
export const deleteTransactionsSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
});

export type DeleteTransactionsInput = z.infer<typeof deleteTransactionsSchema>;

// Suggestion types
export interface CategorySuggestionDto {
  id: string;
  type: 'categorization';
  confidence: number;
  suggestedCategory: {
    id: string;
    name: string;
  };
  rationale?: string;
}

export interface MatchSuggestionDto {
  id: string;
  type: 'match';
  confidence: number;
  matchedInvoice: {
    id: string;
    invoiceNumber: string | null;
    total: string;
  };
  rationale?: string;
}

export type SuggestionDto = CategorySuggestionDto | MatchSuggestionDto;

// Transaction DTO
export interface TransactionDto {
  id: string;
  postedAt: string;
  description: string;
  amount: string;
  currency: string;
  balance: string | null;
  hasMatch: boolean;
  categoryId: string | null;
  categoryName: string | null;
  pendingSuggestions?: SuggestionDto[];
}

// List response
export interface TransactionListDto {
  transactions: TransactionDto[];
  total: number;
  page: number;
  pageSize: number;
}

// Delete response
export interface DeleteTransactionsDto {
  deleted: number;
}
