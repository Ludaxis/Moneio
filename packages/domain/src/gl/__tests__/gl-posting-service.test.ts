import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GLPostingError, GLPostingService } from '../gl-posting-service';
import type {
  BankAccountForPosting,
  CategoryForPosting,
  GLAccountForPosting,
  GLPostingRepository,
  TransactionForPosting,
} from '../types';

// Mock repository
function createMockRepository(): GLPostingRepository {
  return {
    getTransactionById: vi.fn(),
    getTransactionWithRelations: vi.fn(),
    getGLAccountById: vi.fn(),
    getDefaultBankGLAccount: vi.fn(),
    createJournalEntry: vi.fn(),
    findJournalEntryByReference: vi.fn(),
    updateJournalEntryStatus: vi.fn(),
    getNextEntryNumber: vi.fn().mockResolvedValue('JE-2026-0001'),
  };
}

// Test fixtures
const mockTransaction: TransactionForPosting = {
  id: 'tx-123',
  workspaceId: 'ws-123',
  bankAccountId: 'ba-123',
  postedAt: '2026-01-01T12:00:00Z',
  description: 'Test transaction',
  amount: 100.0, // Positive = income
  currency: 'EUR',
};

const mockExpenseTransaction: TransactionForPosting = {
  ...mockTransaction,
  id: 'tx-456',
  amount: -50.0, // Negative = expense
  description: 'Expense transaction',
};

const mockCategory: CategoryForPosting = {
  id: 'cat-123',
  name: 'Sales Revenue',
  glAccountId: 'gl-income-123',
};

const mockBankAccount: BankAccountForPosting = {
  id: 'ba-123',
  name: 'Main Bank Account',
  glAccountId: 'gl-bank-123',
};

const mockBankGLAccount: GLAccountForPosting = {
  id: 'gl-bank-123',
  accountCode: '1110',
  accountName: 'Cash and Bank',
  accountType: 'ASSET',
  normalBalance: 'DEBIT',
};

const mockIncomeGLAccount: GLAccountForPosting = {
  id: 'gl-income-123',
  accountCode: '4100',
  accountName: 'Sales Revenue',
  accountType: 'INCOME',
  normalBalance: 'CREDIT',
};

const mockExpenseGLAccount: GLAccountForPosting = {
  id: 'gl-expense-123',
  accountCode: '5210',
  accountName: 'Rent Expense',
  accountType: 'EXPENSE',
  normalBalance: 'DEBIT',
};

describe('GLPostingService', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let service: GLPostingService;

  beforeEach(() => {
    repository = createMockRepository();
    service = new GLPostingService(repository);
  });

  describe('postTransaction', () => {
    it('should create journal entry for income transaction (DR Bank / CR Income)', async () => {
      // Setup mocks
      (repository.findJournalEntryByReference as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (repository.createJournalEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'je-123',
        entryNumber: 'JE-2026-0001',
      });

      const result = await service.postTransaction({
        transaction: mockTransaction,
        category: mockCategory,
        bankAccount: mockBankAccount,
        categoryGlAccount: mockIncomeGLAccount,
        bankGlAccount: mockBankGLAccount,
        userId: 'user-123',
      });

      // Verify result
      expect(result.journalEntryId).toBe('je-123');
      expect(result.entryNumber).toBe('JE-2026-0001');
      expect(result.status).toBe('POSTED');
      expect(result.totalAmount).toBe(100);

      // Verify journal entry was created with correct lines
      expect(repository.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-123',
          referenceType: 'bank_transaction',
          referenceId: 'tx-123',
          status: 'POSTED',
          lines: expect.arrayContaining([
            // DR Bank
            expect.objectContaining({
              glAccountId: 'gl-bank-123',
              debitAmount: 100,
              creditAmount: 0,
            }),
            // CR Income
            expect.objectContaining({
              glAccountId: 'gl-income-123',
              debitAmount: 0,
              creditAmount: 100,
            }),
          ]),
        })
      );
    });

    it('should create journal entry for expense transaction (DR Expense / CR Bank)', async () => {
      // Setup mocks
      (repository.findJournalEntryByReference as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (repository.createJournalEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'je-456',
        entryNumber: 'JE-2026-0002',
      });

      const expenseCategory: CategoryForPosting = {
        id: 'cat-expense',
        name: 'Rent Expense',
        glAccountId: 'gl-expense-123',
      };

      const result = await service.postTransaction({
        transaction: mockExpenseTransaction,
        category: expenseCategory,
        bankAccount: mockBankAccount,
        categoryGlAccount: mockExpenseGLAccount,
        bankGlAccount: mockBankGLAccount,
        userId: 'user-123',
      });

      // Verify result
      expect(result.totalAmount).toBe(50); // Absolute value

      // Verify journal entry was created with correct lines
      expect(repository.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            // DR Expense
            expect.objectContaining({
              glAccountId: 'gl-expense-123',
              debitAmount: 50,
              creditAmount: 0,
            }),
            // CR Bank
            expect.objectContaining({
              glAccountId: 'gl-bank-123',
              debitAmount: 0,
              creditAmount: 50,
            }),
          ]),
        })
      );
    });

    it('should throw MISSING_GL_MAPPING error if category has no GL account', async () => {
      const categoryWithoutGL: CategoryForPosting = {
        id: 'cat-no-gl',
        name: 'Uncategorized',
        glAccountId: null,
      };

      await expect(
        service.postTransaction({
          transaction: mockTransaction,
          category: categoryWithoutGL,
          bankAccount: mockBankAccount,
          categoryGlAccount: null as unknown as GLAccountForPosting,
          bankGlAccount: mockBankGLAccount,
          userId: 'user-123',
        })
      ).rejects.toThrow(GLPostingError);

      await expect(
        service.postTransaction({
          transaction: mockTransaction,
          category: categoryWithoutGL,
          bankAccount: mockBankAccount,
          categoryGlAccount: null as unknown as GLAccountForPosting,
          bankGlAccount: mockBankGLAccount,
          userId: 'user-123',
        })
      ).rejects.toMatchObject({ code: 'MISSING_GL_MAPPING' });
    });

    it('should throw MISSING_GL_MAPPING error if bank account has no GL account', async () => {
      const bankAccountWithoutGL: BankAccountForPosting = {
        id: 'ba-no-gl',
        name: 'Manual Account',
        glAccountId: null,
      };

      await expect(
        service.postTransaction({
          transaction: mockTransaction,
          category: mockCategory,
          bankAccount: bankAccountWithoutGL,
          categoryGlAccount: mockIncomeGLAccount,
          bankGlAccount: null as unknown as GLAccountForPosting,
          userId: 'user-123',
        })
      ).rejects.toMatchObject({ code: 'MISSING_GL_MAPPING' });
    });

    it('should throw ALREADY_POSTED error if transaction is already posted', async () => {
      // Return existing non-reversed entry
      (repository.findJournalEntryByReference as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-je',
        status: 'POSTED',
      });

      await expect(
        service.postTransaction({
          transaction: mockTransaction,
          category: mockCategory,
          bankAccount: mockBankAccount,
          categoryGlAccount: mockIncomeGLAccount,
          bankGlAccount: mockBankGLAccount,
          userId: 'user-123',
        })
      ).rejects.toMatchObject({ code: 'ALREADY_POSTED' });
    });

    it('should allow posting if previous entry was reversed', async () => {
      // Return existing but REVERSED entry
      (repository.findJournalEntryByReference as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'reversed-je',
        status: 'REVERSED',
      });
      (repository.createJournalEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'je-new',
        entryNumber: 'JE-2026-0003',
      });

      const result = await service.postTransaction({
        transaction: mockTransaction,
        category: mockCategory,
        bankAccount: mockBankAccount,
        categoryGlAccount: mockIncomeGLAccount,
        bankGlAccount: mockBankGLAccount,
        userId: 'user-123',
      });

      expect(result.journalEntryId).toBe('je-new');
    });
  });

  describe('canPost', () => {
    it('should return canPost: true when all conditions are met', async () => {
      (repository.getTransactionWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
        transaction: mockTransaction,
        category: mockCategory,
        bankAccount: mockBankAccount,
        categoryGlAccount: mockIncomeGLAccount,
        bankGlAccount: mockBankGLAccount,
      });
      (repository.findJournalEntryByReference as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.canPost('tx-123');

      expect(result.canPost).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return canPost: false when transaction not found', async () => {
      (repository.getTransactionWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.canPost('tx-nonexistent');

      expect(result.canPost).toBe(false);
      expect(result.reason).toBe('Transaction not found');
    });

    it('should return canPost: false when transaction is not categorized', async () => {
      (repository.getTransactionWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
        transaction: mockTransaction,
        category: null,
        bankAccount: mockBankAccount,
        categoryGlAccount: null,
        bankGlAccount: mockBankGLAccount,
      });

      const result = await service.canPost('tx-123');

      expect(result.canPost).toBe(false);
      expect(result.reason).toBe('Transaction is not categorized');
    });

    it('should return canPost: false when already posted', async () => {
      (repository.getTransactionWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
        transaction: mockTransaction,
        category: mockCategory,
        bankAccount: mockBankAccount,
        categoryGlAccount: mockIncomeGLAccount,
        bankGlAccount: mockBankGLAccount,
      });
      (repository.findJournalEntryByReference as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-je',
        status: 'POSTED',
      });

      const result = await service.canPost('tx-123');

      expect(result.canPost).toBe(false);
      expect(result.reason).toBe('Already posted to GL');
    });
  });

  describe('bulkPost', () => {
    it('should post multiple transactions and return counts', async () => {
      // Mock postTransactionById to succeed for first two, fail for third
      const postSpy = vi.spyOn(service, 'postTransactionById');
      postSpy
        .mockResolvedValueOnce({
          journalEntryId: 'je-1',
          entryNumber: 'JE-2026-0001',
          status: 'POSTED',
          totalAmount: 100,
        })
        .mockResolvedValueOnce({
          journalEntryId: 'je-2',
          entryNumber: 'JE-2026-0002',
          status: 'POSTED',
          totalAmount: 50,
        })
        .mockRejectedValueOnce(
          new GLPostingError('Category does not have GL mapping', 'MISSING_GL_MAPPING')
        );

      const result = await service.bulkPost({
        transactionIds: ['tx-1', 'tx-2', 'tx-3'],
        workspaceId: 'ws-123',
        userId: 'user-123',
      });

      expect(result.posted).toBe(2);
      expect(result.skipped).toBe(1); // MISSING_GL_MAPPING is treated as skip
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip already posted transactions', async () => {
      const postSpy = vi.spyOn(service, 'postTransactionById');
      postSpy.mockRejectedValue(
        new GLPostingError('Transaction already posted', 'ALREADY_POSTED')
      );

      const result = await service.bulkPost({
        transactionIds: ['tx-1'],
        workspaceId: 'ws-123',
        userId: 'user-123',
      });

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should track failed transactions with errors', async () => {
      const postSpy = vi.spyOn(service, 'postTransactionById');
      postSpy.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.bulkPost({
        transactionIds: ['tx-1'],
        workspaceId: 'ws-123',
        userId: 'user-123',
      });

      expect(result.posted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].transactionId).toBe('tx-1');
      expect(result.errors[0].error).toBe('Database connection failed');
    });
  });

  describe('GLPostingError', () => {
    it('should have correct error code', () => {
      const error = new GLPostingError('Test error', 'MISSING_GL_MAPPING');

      expect(error.name).toBe('GLPostingError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('MISSING_GL_MAPPING');
    });
  });
});
