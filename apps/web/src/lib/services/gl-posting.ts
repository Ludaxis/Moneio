/**
 * GL Posting Service
 *
 * Prisma-backed implementation of GLPostingRepository and GL posting utilities.
 */

import { prisma } from '@moneio/db';
import { GLPostingError, GLPostingService } from '@moneio/domain';
import type {
  BankAccountForPosting,
  CategoryForPosting,
  GLAccountForPosting,
  GLPostingRepository,
  TransactionForPosting,
} from '@moneio/domain';

// ============================================================
// Repository Implementation
// ============================================================

/**
 * Prisma-backed implementation of GLPostingRepository
 */
class PrismaGLPostingRepository implements GLPostingRepository {
  async getTransactionById(id: string): Promise<TransactionForPosting | null> {
    const tx = await prisma.bankTransaction.findUnique({
      where: { id },
    });

    if (!tx) return null;

    return {
      id: tx.id,
      workspaceId: tx.workspaceId,
      bankAccountId: tx.bankAccountId,
      postedAt: tx.postedAt.toISOString(),
      description: tx.description,
      amount: tx.amount.toNumber(),
      currency: tx.currency as TransactionForPosting['currency'],
    };
  }

  async getTransactionWithRelations(id: string): Promise<{
    transaction: TransactionForPosting;
    category: CategoryForPosting | null;
    bankAccount: BankAccountForPosting;
    categoryGlAccount: GLAccountForPosting | null;
    bankGlAccount: GLAccountForPosting | null;
  } | null> {
    const tx = await prisma.bankTransaction.findUnique({
      where: { id },
      include: {
        bankAccount: {
          include: {
            glAccount: true,
          },
        },
        categorizations: {
          where: { approved: true },
          take: 1,
          include: {
            category: {
              include: {
                glAccount: true,
              },
            },
          },
        },
      },
    });

    if (!tx) return null;

    const categorization = tx.categorizations[0];
    const category = categorization?.category;

    return {
      transaction: {
        id: tx.id,
        workspaceId: tx.workspaceId,
        bankAccountId: tx.bankAccountId,
        postedAt: tx.postedAt.toISOString(),
        description: tx.description,
        amount: tx.amount.toNumber(),
        currency: tx.currency as TransactionForPosting['currency'],
      },
      category: category
        ? {
            id: category.id,
            name: category.name,
            glAccountId: category.glAccountId,
          }
        : null,
      bankAccount: {
        id: tx.bankAccount.id,
        name: tx.bankAccount.name,
        glAccountId: tx.bankAccount.glAccountId,
      },
      categoryGlAccount: category?.glAccount
        ? {
            id: category.glAccount.id,
            accountCode: category.glAccount.accountCode,
            accountName: category.glAccount.accountName,
            accountType: category.glAccount.accountType,
            normalBalance: category.glAccount.normalBalance,
          }
        : null,
      bankGlAccount: tx.bankAccount.glAccount
        ? {
            id: tx.bankAccount.glAccount.id,
            accountCode: tx.bankAccount.glAccount.accountCode,
            accountName: tx.bankAccount.glAccount.accountName,
            accountType: tx.bankAccount.glAccount.accountType,
            normalBalance: tx.bankAccount.glAccount.normalBalance,
          }
        : null,
    };
  }

  async getGLAccountById(id: string): Promise<GLAccountForPosting | null> {
    const account = await prisma.gLAccount.findUnique({
      where: { id },
    });

    if (!account) return null;

    return {
      id: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
    };
  }

  async getDefaultBankGLAccount(workspaceId: string): Promise<GLAccountForPosting | null> {
    // Find the default "Cash and Bank" account (1110)
    const account = await prisma.gLAccount.findFirst({
      where: {
        workspaceId,
        accountCode: '1110',
        isActive: true,
      },
    });

    if (!account) return null;

    return {
      id: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
    };
  }

  async createJournalEntry(data: {
    workspaceId: string;
    entryNumber: string;
    entryDate: string;
    description: string;
    referenceType: string;
    referenceId: string;
    status: 'DRAFT' | 'POSTED';
    postedAt?: string;
    postedBy?: string;
    lines: Array<{
      glAccountId: string;
      description: string;
      debitAmount: number;
      creditAmount: number;
      currency: string;
      lineOrder: number;
    }>;
  }): Promise<{ id: string; entryNumber: string }> {
    const entry = await prisma.journalEntry.create({
      data: {
        workspaceId: data.workspaceId,
        entryNumber: data.entryNumber,
        entryDate: new Date(data.entryDate),
        description: data.description,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        status: data.status,
        postedAt: data.postedAt ? new Date(data.postedAt) : null,
        postedBy: data.postedBy,
        lines: {
          create: data.lines.map((line) => ({
            glAccountId: line.glAccountId,
            description: line.description,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            currency: line.currency,
            lineOrder: line.lineOrder,
          })),
        },
      },
    });

    return {
      id: entry.id,
      entryNumber: entry.entryNumber,
    };
  }

  async findJournalEntryByReference(
    workspaceId: string,
    referenceType: string,
    referenceId: string
  ): Promise<{ id: string; status: string } | null> {
    const entry = await prisma.journalEntry.findFirst({
      where: {
        workspaceId,
        referenceType,
        referenceId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return entry;
  }

  async updateJournalEntryStatus(
    id: string,
    status: 'DRAFT' | 'POSTED' | 'REVERSED',
    reversedAt?: string,
    reversedBy?: string
  ): Promise<void> {
    await prisma.journalEntry.update({
      where: { id },
      data: {
        status,
        reversedAt: reversedAt ? new Date(reversedAt) : undefined,
        reversedBy,
      },
    });
  }

  async getNextEntryNumber(workspaceId: string): Promise<string> {
    // Get the year prefix
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;

    // Find the highest entry number for this year
    const lastEntry = await prisma.journalEntry.findFirst({
      where: {
        workspaceId,
        entryNumber: { startsWith: prefix },
      },
      orderBy: { entryNumber: 'desc' },
      select: { entryNumber: true },
    });

    if (!lastEntry) {
      return `${prefix}0001`;
    }

    // Extract the sequence number and increment
    const lastSequence = parseInt(lastEntry.entryNumber.slice(prefix.length), 10);
    const nextSequence = (lastSequence + 1).toString().padStart(4, '0');

    return `${prefix}${nextSequence}`;
  }
}

// ============================================================
// Singleton Service Instance
// ============================================================

const repository = new PrismaGLPostingRepository();
export const glPostingService = new GLPostingService(repository);

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Post a categorized transaction to GL
 *
 * This is a convenience function that handles the common case
 * of posting after categorization approval.
 *
 * @returns PostTransactionResult if posted, null if skipped (no GL mapping)
 */
export async function postTransactionToGL(
  transactionId: string,
  categoryId: string,
  _workspaceId: string,
  userId: string
): Promise<{ journalEntryId: string; entryNumber: string } | null> {
  // Get transaction with bank account
  const tx = await prisma.bankTransaction.findUnique({
    where: { id: transactionId },
    include: {
      bankAccount: {
        include: { glAccount: true },
      },
    },
  });

  if (!tx) {
    throw new Error('Transaction not found');
  }

  // Get category with GL account
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { glAccount: true },
  });

  if (!category) {
    throw new Error('Category not found');
  }

  // Check if both have GL mappings
  if (!category.glAccountId || !category.glAccount) {
    // Graceful degradation: skip GL posting if no category GL mapping
    return null;
  }

  if (!tx.bankAccount.glAccountId || !tx.bankAccount.glAccount) {
    // Graceful degradation: skip GL posting if no bank account GL mapping
    return null;
  }

  try {
    const result = await glPostingService.postTransaction({
      transaction: {
        id: tx.id,
        workspaceId: tx.workspaceId,
        bankAccountId: tx.bankAccountId,
        postedAt: tx.postedAt.toISOString(),
        description: tx.description,
        amount: tx.amount.toNumber(),
        currency: tx.currency as TransactionForPosting['currency'],
      },
      category: {
        id: category.id,
        name: category.name,
        glAccountId: category.glAccountId,
      },
      bankAccount: {
        id: tx.bankAccount.id,
        name: tx.bankAccount.name,
        glAccountId: tx.bankAccount.glAccountId,
      },
      categoryGlAccount: {
        id: category.glAccount.id,
        accountCode: category.glAccount.accountCode,
        accountName: category.glAccount.accountName,
        accountType: category.glAccount.accountType,
        normalBalance: category.glAccount.normalBalance,
      },
      bankGlAccount: {
        id: tx.bankAccount.glAccount.id,
        accountCode: tx.bankAccount.glAccount.accountCode,
        accountName: tx.bankAccount.glAccount.accountName,
        accountType: tx.bankAccount.glAccount.accountType,
        normalBalance: tx.bankAccount.glAccount.normalBalance,
      },
      userId,
    });

    return {
      journalEntryId: result.journalEntryId,
      entryNumber: result.entryNumber,
    };
  } catch (error) {
    if (error instanceof GLPostingError) {
      if (error.code === 'ALREADY_POSTED') {
        // Already posted is fine, skip silently
        return null;
      }
      if (error.code === 'MISSING_GL_MAPPING') {
        // No GL mapping is fine, skip silently
        return null;
      }
    }
    throw error;
  }
}

/**
 * Check if a transaction can be posted to GL
 */
export async function canPostToGL(transactionId: string): Promise<{
  canPost: boolean;
  reason?: string;
}> {
  return glPostingService.canPost(transactionId);
}

// Re-export error class for error handling
export { GLPostingError };
