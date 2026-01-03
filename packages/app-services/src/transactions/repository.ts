/**
 * Transaction Repository - Prisma implementation
 *
 * Handles all database access for transactions.
 */

import { prisma } from '@moneio/db';

export interface TransactionQueryOptions {
  page: number;
  pageSize: number;
  uncategorized?: boolean;
}

export interface TransactionWithRelations {
  id: string;
  postedAt: Date;
  description: string;
  amount: { toString(): string };
  currency: string;
  balance: { toString(): string } | null;
  categorizations: Array<{
    category: {
      id: string;
      name: string;
    };
  }>;
  matches: Array<{ id: string }>;
}

interface CategorizationSuggestion {
  id: string;
  targetId: string;
  confidence: { toString(): string } | number | null;
  payloadJson: unknown;
}

interface MatchSuggestion {
  id: string;
  transactionId: string;
  confidence: { toString(): string } | number | null;
  rationale: string | null;
  invoice: {
    id: string;
    invoiceNumber: string | null;
    total: { toString(): string };
  };
}

export class TransactionRepository {
  /**
   * Find transactions for a workspace with pagination and filtering
   */
  async findByWorkspace(
    workspaceId: string,
    options: TransactionQueryOptions
  ): Promise<{ items: TransactionWithRelations[]; total: number }> {
    const { page, pageSize, uncategorized } = options;

    const where = {
      workspaceId,
      ...(uncategorized && {
        categorizations: {
          none: { approved: true },
        },
      }),
    };

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

    return {
      items: transactions as unknown as TransactionWithRelations[],
      total,
    };
  }

  /**
   * Find categorization suggestions for transactions
   */
  async findCategorizationSuggestions(
    workspaceId: string,
    transactionIds: string[]
  ): Promise<CategorizationSuggestion[]> {
    const suggestions = await prisma.aiSuggestion.findMany({
      where: {
        workspaceId,
        suggestionType: 'categorization',
        status: 'pending',
        targetId: { in: transactionIds },
      },
    });

    return suggestions as unknown as CategorizationSuggestion[];
  }

  /**
   * Find match suggestions for transactions
   */
  async findMatchSuggestions(
    workspaceId: string,
    transactionIds: string[]
  ): Promise<MatchSuggestion[]> {
    const matches = await prisma.match.findMany({
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

    return matches as unknown as MatchSuggestion[];
  }

  /**
   * Delete transactions by IDs (within workspace scope)
   */
  async deleteByIds(workspaceId: string, transactionIds: string[]): Promise<number> {
    const result = await prisma.bankTransaction.deleteMany({
      where: {
        id: { in: transactionIds },
        workspaceId,
      },
    });

    return result.count;
  }
}
