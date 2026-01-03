/**
 * GL Posting Service
 *
 * Handles posting bank transactions to the General Ledger using double-entry bookkeeping.
 *
 * Double-Entry Rules:
 * - Income (positive amount): DR Bank Account / CR Income Account
 * - Expense (negative amount): DR Expense Account / CR Bank Account
 */

import { validateJournalEntry } from '@moneio/core-ledger';
import type { JournalLine } from '@moneio/core-ledger';

import type {
  BulkPostInput,
  BulkPostResult,
  GLPostingRepository,
  PostTransactionInput,
  PostTransactionResult,
  ReverseEntryInput,
  ReverseEntryResult,
} from './types';

/**
 * Error thrown when GL posting validation fails
 */
export class GLPostingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'MISSING_GL_MAPPING'
      | 'VALIDATION_FAILED'
      | 'ALREADY_POSTED'
      | 'NOT_FOUND'
      | 'INVALID_STATUS'
  ) {
    super(message);
    this.name = 'GLPostingError';
  }
}

/**
 * GL Posting Service
 */
export class GLPostingService {
  constructor(private readonly repository: GLPostingRepository) {}

  /**
   * Post a single transaction to the GL
   *
   * Creates a journal entry with two lines following double-entry bookkeeping:
   * - Income: DR Bank / CR Income
   * - Expense: DR Expense / CR Bank
   */
  async postTransaction(input: PostTransactionInput): Promise<PostTransactionResult> {
    const { transaction, category, categoryGlAccount, bankGlAccount, userId } = input;

    // Validate GL mappings exist
    if (!categoryGlAccount) {
      throw new GLPostingError(
        `Category "${category.name}" does not have a GL account mapping`,
        'MISSING_GL_MAPPING'
      );
    }

    if (!bankGlAccount) {
      throw new GLPostingError(
        'Bank account does not have a GL account mapping',
        'MISSING_GL_MAPPING'
      );
    }

    // Check if already posted
    const existingEntry = await this.repository.findJournalEntryByReference(
      transaction.workspaceId,
      'bank_transaction',
      transaction.id
    );

    if (existingEntry && existingEntry.status !== 'REVERSED') {
      throw new GLPostingError(
        'Transaction has already been posted to GL',
        'ALREADY_POSTED'
      );
    }

    // Determine amount (always work with positive number for journal lines)
    const amount = Math.abs(transaction.amount);
    const isIncome = transaction.amount > 0;

    // Build journal lines based on transaction type
    const lines: JournalLine[] = isIncome
      ? this.buildIncomeJournalLines(
          bankGlAccount.id,
          categoryGlAccount.id,
          amount,
          transaction.currency,
          transaction.description
        )
      : this.buildExpenseJournalLines(
          bankGlAccount.id,
          categoryGlAccount.id,
          amount,
          transaction.currency,
          transaction.description
        );

    // Validate journal entry (debits = credits)
    const validation = validateJournalEntry(lines);
    if (!validation.isValid) {
      throw new GLPostingError(
        `Journal validation failed: ${validation.errors.join(', ')}`,
        'VALIDATION_FAILED'
      );
    }

    // Generate entry number
    const entryNumber = await this.repository.getNextEntryNumber(transaction.workspaceId);

    // Create journal entry
    const now = new Date().toISOString();
    const entry = await this.repository.createJournalEntry({
      workspaceId: transaction.workspaceId,
      entryNumber,
      entryDate: transaction.postedAt.split('T')[0], // Use transaction date
      description: this.buildEntryDescription(transaction.description, isIncome),
      referenceType: 'bank_transaction',
      referenceId: transaction.id,
      status: 'POSTED',
      postedAt: now,
      postedBy: userId,
      lines: lines.map((line, index) => ({
        glAccountId: line.glAccountId,
        description: line.description || '',
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        currency: line.currency,
        lineOrder: index + 1,
      })),
    });

    return {
      journalEntryId: entry.id,
      entryNumber: entry.entryNumber,
      status: 'POSTED',
      totalAmount: amount,
    };
  }

  /**
   * Post a transaction by ID (fetches all required data)
   */
  async postTransactionById(
    transactionId: string,
    userId: string
  ): Promise<PostTransactionResult> {
    const data = await this.repository.getTransactionWithRelations(transactionId);

    if (!data) {
      throw new GLPostingError('Transaction not found', 'NOT_FOUND');
    }

    const { transaction, category, bankAccount, categoryGlAccount, bankGlAccount } = data;

    if (!category) {
      throw new GLPostingError('Transaction is not categorized', 'MISSING_GL_MAPPING');
    }

    return this.postTransaction({
      transaction,
      category,
      bankAccount,
      categoryGlAccount: categoryGlAccount!,
      bankGlAccount: bankGlAccount!,
      userId,
    });
  }

  /**
   * Reverse a journal entry (for re-categorization)
   */
  async reverseEntry(input: ReverseEntryInput): Promise<ReverseEntryResult> {
    const { journalEntryId, workspaceId, userId, reason } = input;

    // Find original entry
    const originalEntry = await this.repository.findJournalEntryByReference(
      workspaceId,
      'bank_transaction',
      journalEntryId
    );

    if (!originalEntry) {
      throw new GLPostingError('Journal entry not found', 'NOT_FOUND');
    }

    if (originalEntry.status === 'REVERSED') {
      throw new GLPostingError('Journal entry is already reversed', 'INVALID_STATUS');
    }

    // Mark original as reversed
    const now = new Date().toISOString();
    await this.repository.updateJournalEntryStatus(
      originalEntry.id,
      'REVERSED',
      now,
      userId
    );

    // Create reversal entry (swap debits and credits)
    const reversalNumber = await this.repository.getNextEntryNumber(workspaceId);
    const reversalEntry = await this.repository.createJournalEntry({
      workspaceId,
      entryNumber: reversalNumber,
      entryDate: now.split('T')[0],
      description: `Reversal: ${reason}`,
      referenceType: 'reversal',
      referenceId: originalEntry.id,
      status: 'POSTED',
      postedAt: now,
      postedBy: userId,
      lines: [], // Reversal lines would be fetched and swapped - simplified for now
    });

    return {
      originalEntryId: originalEntry.id,
      reversalEntryId: reversalEntry.id,
      reversalEntryNumber: reversalEntry.entryNumber,
    };
  }

  /**
   * Bulk post multiple transactions
   */
  async bulkPost(input: BulkPostInput): Promise<BulkPostResult> {
    const { transactionIds, userId } = input;
    const result: BulkPostResult = {
      posted: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    for (const transactionId of transactionIds) {
      try {
        await this.postTransactionById(transactionId, userId);
        result.posted++;
      } catch (error) {
        if (error instanceof GLPostingError) {
          if (error.code === 'ALREADY_POSTED') {
            result.skipped++;
          } else if (error.code === 'MISSING_GL_MAPPING') {
            // Skip transactions without GL mapping (graceful degradation)
            result.skipped++;
          } else {
            result.failed++;
            result.errors.push({
              transactionId,
              error: error.message,
            });
          }
        } else {
          result.failed++;
          result.errors.push({
            transactionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return result;
  }

  /**
   * Check if a transaction can be posted to GL
   */
  async canPost(transactionId: string): Promise<{ canPost: boolean; reason?: string }> {
    const data = await this.repository.getTransactionWithRelations(transactionId);

    if (!data) {
      return { canPost: false, reason: 'Transaction not found' };
    }

    if (!data.category) {
      return { canPost: false, reason: 'Transaction is not categorized' };
    }

    if (!data.categoryGlAccount) {
      return { canPost: false, reason: 'Category does not have GL mapping' };
    }

    if (!data.bankGlAccount) {
      return { canPost: false, reason: 'Bank account does not have GL mapping' };
    }

    // Check if already posted
    const existingEntry = await this.repository.findJournalEntryByReference(
      data.transaction.workspaceId,
      'bank_transaction',
      transactionId
    );

    if (existingEntry && existingEntry.status !== 'REVERSED') {
      return { canPost: false, reason: 'Already posted to GL' };
    }

    return { canPost: true };
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  /**
   * Build journal lines for income transaction
   * DR Bank Account / CR Income Account
   */
  private buildIncomeJournalLines(
    bankGlAccountId: string,
    incomeGlAccountId: string,
    amount: number,
    currency: string,
    description: string | null
  ): JournalLine[] {
    return [
      {
        glAccountId: bankGlAccountId,
        description: description || 'Bank deposit',
        debitAmount: amount,
        creditAmount: 0,
        currency,
        lineOrder: 1,
      },
      {
        glAccountId: incomeGlAccountId,
        description: description || 'Income',
        debitAmount: 0,
        creditAmount: amount,
        currency,
        lineOrder: 2,
      },
    ];
  }

  /**
   * Build journal lines for expense transaction
   * DR Expense Account / CR Bank Account
   */
  private buildExpenseJournalLines(
    bankGlAccountId: string,
    expenseGlAccountId: string,
    amount: number,
    currency: string,
    description: string | null
  ): JournalLine[] {
    return [
      {
        glAccountId: expenseGlAccountId,
        description: description || 'Expense',
        debitAmount: amount,
        creditAmount: 0,
        currency,
        lineOrder: 1,
      },
      {
        glAccountId: bankGlAccountId,
        description: description || 'Bank withdrawal',
        debitAmount: 0,
        creditAmount: amount,
        currency,
        lineOrder: 2,
      },
    ];
  }

  /**
   * Build description for journal entry
   */
  private buildEntryDescription(
    transactionDescription: string | null,
    isIncome: boolean
  ): string {
    if (transactionDescription) {
      return transactionDescription;
    }
    return isIncome ? 'Bank transaction - Income' : 'Bank transaction - Expense';
  }
}
