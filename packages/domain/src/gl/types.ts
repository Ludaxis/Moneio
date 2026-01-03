/**
 * GL Posting Service Types
 *
 * Types for posting bank transactions to the General Ledger
 */

import type { CurrencyCode, UUID } from '@moneio/core-ledger';

// ============================================================
// Input/Output Types
// ============================================================

/**
 * Bank transaction data needed for GL posting
 */
export interface TransactionForPosting {
  id: UUID;
  workspaceId: UUID;
  bankAccountId: UUID;
  postedAt: string;
  description: string | null;
  amount: number; // Decimal as number (positive = income, negative = expense)
  currency: CurrencyCode;
}

/**
 * Category data needed for GL posting
 */
export interface CategoryForPosting {
  id: UUID;
  name: string;
  glAccountId: UUID | null;
}

/**
 * Bank account data needed for GL posting
 */
export interface BankAccountForPosting {
  id: UUID;
  name: string;
  glAccountId: UUID | null;
}

/**
 * GL Account data needed for posting
 */
export interface GLAccountForPosting {
  id: UUID;
  accountCode: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
}

/**
 * Input for posting a single transaction to GL
 */
export interface PostTransactionInput {
  transaction: TransactionForPosting;
  category: CategoryForPosting;
  bankAccount: BankAccountForPosting;
  categoryGlAccount: GLAccountForPosting;
  bankGlAccount: GLAccountForPosting;
  userId: UUID;
}

/**
 * Result of posting a transaction to GL
 */
export interface PostTransactionResult {
  journalEntryId: UUID;
  entryNumber: string;
  status: 'DRAFT' | 'POSTED';
  totalAmount: number;
}

/**
 * Input for reversing a journal entry
 */
export interface ReverseEntryInput {
  journalEntryId: UUID;
  workspaceId: UUID;
  userId: UUID;
  reason: string;
}

/**
 * Result of reversing a journal entry
 */
export interface ReverseEntryResult {
  originalEntryId: UUID;
  reversalEntryId: UUID;
  reversalEntryNumber: string;
}

/**
 * Input for bulk posting transactions
 */
export interface BulkPostInput {
  transactionIds: UUID[];
  workspaceId: UUID;
  userId: UUID;
}

/**
 * Result of bulk posting transactions
 */
export interface BulkPostResult {
  posted: number;
  skipped: number;
  failed: number;
  errors: Array<{ transactionId: UUID; error: string }>;
}

// ============================================================
// Repository Interface
// ============================================================

/**
 * Repository interface for GL posting operations
 */
export interface GLPostingRepository {
  // Transaction queries
  getTransactionById(id: UUID): Promise<TransactionForPosting | null>;
  getTransactionWithRelations(
    id: UUID
  ): Promise<{
    transaction: TransactionForPosting;
    category: CategoryForPosting | null;
    bankAccount: BankAccountForPosting;
    categoryGlAccount: GLAccountForPosting | null;
    bankGlAccount: GLAccountForPosting | null;
  } | null>;

  // GL Account queries
  getGLAccountById(id: UUID): Promise<GLAccountForPosting | null>;
  getDefaultBankGLAccount(workspaceId: UUID): Promise<GLAccountForPosting | null>;

  // Journal entry operations
  createJournalEntry(data: {
    workspaceId: UUID;
    entryNumber: string;
    entryDate: string;
    description: string;
    referenceType: string;
    referenceId: UUID;
    status: 'DRAFT' | 'POSTED';
    postedAt?: string;
    postedBy?: UUID;
    lines: Array<{
      glAccountId: UUID;
      description: string;
      debitAmount: number;
      creditAmount: number;
      currency: string;
      lineOrder: number;
    }>;
  }): Promise<{ id: UUID; entryNumber: string }>;

  findJournalEntryByReference(
    workspaceId: UUID,
    referenceType: string,
    referenceId: UUID
  ): Promise<{ id: UUID; status: string } | null>;

  updateJournalEntryStatus(
    id: UUID,
    status: 'DRAFT' | 'POSTED' | 'REVERSED',
    reversedAt?: string,
    reversedBy?: UUID
  ): Promise<void>;

  // Entry number generation
  getNextEntryNumber(workspaceId: UUID): Promise<string>;
}
