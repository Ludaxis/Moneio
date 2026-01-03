import { prisma } from '@moneio/db';
import { GLPostingError, GLPostingService } from '@moneio/domain';
import type {
  BankAccountForPosting,
  CategoryForPosting,
  GLAccountForPosting,
  GLPostingRepository,
  TransactionForPosting,
} from '@moneio/domain';
import type { Job } from 'bullmq';

import type { GlPostJobData, GlPostResult } from '../lib/queues';

/**
 * Prisma-backed implementation of GLPostingRepository for the worker
 */
class WorkerGLPostingRepository implements GLPostingRepository {
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
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;

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

    const lastSequence = parseInt(lastEntry.entryNumber.slice(prefix.length), 10);
    const nextSequence = (lastSequence + 1).toString().padStart(4, '0');

    return `${prefix}${nextSequence}`;
  }
}

// Create singleton service instance
const repository = new WorkerGLPostingRepository();
const glPostingService = new GLPostingService(repository);

/**
 * GL_POST handler
 *
 * Post categorized transactions to the General Ledger in bulk.
 * - Processes each transaction individually
 * - Skips transactions without GL mappings
 * - Skips already-posted transactions
 * - Reports success/skip/fail counts
 */
export async function handleGlPost(job: Job<GlPostJobData>): Promise<GlPostResult> {
  const { transactionIds, userId } = job.data;

  console.log(`[GL_POST] Processing ${transactionIds.length} transactions`);

  const result: GlPostResult = {
    success: true,
    posted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    await job.updateProgress(10);

    const totalTransactions = transactionIds.length;
    const progressPerTx = 80 / totalTransactions;

    for (let i = 0; i < transactionIds.length; i++) {
      const transactionId = transactionIds[i];

      try {
        await glPostingService.postTransactionById(transactionId, userId);
        result.posted++;
      } catch (error) {
        if (error instanceof GLPostingError) {
          if (error.code === 'ALREADY_POSTED' || error.code === 'MISSING_GL_MAPPING') {
            // Expected cases - skip without error
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

      // Update progress
      const progress = Math.min(10 + (i + 1) * progressPerTx, 90);
      await job.updateProgress(progress);
    }

    await job.updateProgress(100);

    console.log(
      `[GL_POST] Completed: ${result.posted} posted, ${result.skipped} skipped, ${result.failed} failed`
    );

    // Mark as failed if any errors
    if (result.failed > 0) {
      result.success = false;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GL_POST] Failed:`, errorMessage);

    return {
      success: false,
      posted: result.posted,
      skipped: result.skipped,
      failed: result.failed + (transactionIds.length - result.posted - result.skipped),
      errors: [...result.errors, { transactionId: 'batch', error: errorMessage }],
    };
  }
}
