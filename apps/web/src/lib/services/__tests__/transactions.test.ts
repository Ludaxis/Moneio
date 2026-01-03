/**
 * Transaction Service Unit Tests
 *
 * Tests the business logic of the transaction service.
 * Uses mocked Prisma client.
 */

import type { Prisma } from '@moneio/db';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma client - use vi.hoisted for mock variables
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  deleteMany: vi.fn(),
  aiSuggestionFindMany: vi.fn(),
  matchFindMany: vi.fn(),
}));

vi.mock('@moneio/db', () => ({
  prisma: {
    bankTransaction: {
      findMany: mocks.findMany,
      count: mocks.count,
      deleteMany: mocks.deleteMany,
    },
    aiSuggestion: {
      findMany: mocks.aiSuggestionFindMany,
    },
    match: {
      findMany: mocks.matchFindMany,
    },
  },
}));

// Import after mocking
import { getTransactions, deleteTransactions, listQuerySchema } from '../transactions';

// Convenience aliases
const mockFindMany = mocks.findMany;
const mockCount = mocks.count;
const mockDeleteMany = mocks.deleteMany;
const mockAiSuggestionFindMany = mocks.aiSuggestionFindMany;
const mockMatchFindMany = mocks.matchFindMany;

describe('Transaction Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listQuerySchema', () => {
    it('parses valid query parameters', () => {
      const result = listQuerySchema.safeParse({
        page: '2',
        pageSize: '50',
        uncategorized: 'true',
        includeSuggestions: 'true',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.pageSize).toBe(50);
        expect(result.data.uncategorized).toBe(true);
        expect(result.data.includeSuggestions).toBe(true);
      }
    });

    it('uses default values when not provided', () => {
      const result = listQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(20);
        expect(result.data.uncategorized).toBe(false);
        expect(result.data.includeSuggestions).toBe(false);
      }
    });

    it('validates pageSize max value', () => {
      const result = listQuerySchema.safeParse({
        pageSize: '500',
      });

      expect(result.success).toBe(false);
    });

    it('validates page minimum value', () => {
      const result = listQuerySchema.safeParse({
        page: '0',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('getTransactions', () => {
    const mockTransactions = [
      {
        id: 'tx-1',
        postedAt: new Date('2024-01-15'),
        description: 'Test transaction 1',
        amount: { toString: () => '100.50' } as Prisma.Decimal,
        currency: 'USD',
        balance: { toString: () => '1000.00' } as Prisma.Decimal,
        workspaceId: 'ws-1',
        categorizations: [
          {
            category: { id: 'cat-1', name: 'Office Supplies' },
          },
        ],
        matches: [],
      },
      {
        id: 'tx-2',
        postedAt: new Date('2024-01-14'),
        description: 'Test transaction 2',
        amount: { toString: () => '-50.00' } as Prisma.Decimal,
        currency: 'USD',
        balance: { toString: () => '950.00' } as Prisma.Decimal,
        workspaceId: 'ws-1',
        categorizations: [],
        matches: [{ status: 'approved' }],
      },
    ];

    it('returns formatted transactions with pagination', async () => {
      mockFindMany.mockResolvedValue(mockTransactions);
      mockCount.mockResolvedValue(2);

      const result = await getTransactions('ws-1', { page: 1, pageSize: 20 });

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);

      // Check first transaction formatting
      const tx1 = result.transactions[0];
      expect(tx1.id).toBe('tx-1');
      expect(tx1.amount).toBe('100.50');
      expect(tx1.categoryId).toBe('cat-1');
      expect(tx1.categoryName).toBe('Office Supplies');
      expect(tx1.hasMatch).toBe(false);

      // Check second transaction formatting
      const tx2 = result.transactions[1];
      expect(tx2.categoryId).toBeNull();
      expect(tx2.categoryName).toBeNull();
      expect(tx2.hasMatch).toBe(true);
    });

    it('filters uncategorized transactions when requested', async () => {
      mockFindMany.mockResolvedValue([mockTransactions[1]]);
      mockCount.mockResolvedValue(1);

      await getTransactions('ws-1', { uncategorized: true });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-1',
            categorizations: { none: { approved: true } },
          }),
        })
      );
    });

    it('applies correct pagination offset', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await getTransactions('ws-1', { page: 3, pageSize: 10 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        })
      );
    });

    it('includes pending suggestions when requested', async () => {
      mockFindMany.mockResolvedValue(mockTransactions);
      mockCount.mockResolvedValue(2);
      mockAiSuggestionFindMany.mockResolvedValue([
        {
          id: 'sug-1',
          targetId: 'tx-1',
          suggestionType: 'categorization',
          status: 'pending',
          confidence: { toString: () => '0.85' } as Prisma.Decimal,
          payloadJson: {
            categoryId: 'cat-2',
            categoryName: 'Marketing',
            reason: 'Similar to previous transactions',
          },
        },
      ]);
      mockMatchFindMany.mockResolvedValue([]);

      const result = await getTransactions('ws-1', { includeSuggestions: true });

      expect(result.transactions[0].pendingSuggestions).toBeDefined();
      expect(result.transactions[0].pendingSuggestions).toHaveLength(1);
      expect(result.transactions[0].pendingSuggestions![0].type).toBe('categorization');
      expect(result.transactions[0].pendingSuggestions![0].confidence).toBe(85);
    });
  });

  describe('deleteTransactions', () => {
    it('deletes transactions by IDs within workspace', async () => {
      mockDeleteMany.mockResolvedValue({ count: 3 });

      const result = await deleteTransactions('ws-1', ['tx-1', 'tx-2', 'tx-3']);

      expect(result.deleted).toBe(3);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['tx-1', 'tx-2', 'tx-3'] },
          workspaceId: 'ws-1',
        },
      });
    });

    it('returns zero when no transactions match', async () => {
      mockDeleteMany.mockResolvedValue({ count: 0 });

      const result = await deleteTransactions('ws-1', ['non-existent']);

      expect(result.deleted).toBe(0);
    });
  });
});
