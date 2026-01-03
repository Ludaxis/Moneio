/**
 * GL Migration API
 *
 * POST /api/admin/migrate-gl
 *
 * One-time migration to:
 * 1. Link categories to their GL accounts based on default mappings
 * 2. Link bank accounts to the default Cash and Bank GL account
 * 3. Create GL journal entries for all existing categorized transactions
 */

import type { JournalLine } from '@moneio/core-ledger';
import { validateJournalEntry } from '@moneio/core-ledger';
import {
  hasChartOfAccounts,
  linkBankAccountsToGL,
  linkCategoriesToGLAccounts,
  prisma,
  seedWorkspaceChartOfAccounts,
} from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/migrate-gl
 * Run GL migration for a workspace
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Verify user has access to workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, workspaceId },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    const results = {
      chartOfAccountsSeeded: false,
      glAccountsCreated: 0,
      categoriesLinked: 0,
      bankAccountsLinked: 0,
      journalEntriesCreated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Step 0: Seed Chart of Accounts if needed
    console.log('[MIGRATE-GL] Step 0: Checking Chart of Accounts...');
    const hasCoA = await hasChartOfAccounts(workspaceId);
    if (!hasCoA) {
      console.log('[MIGRATE-GL] No Chart of Accounts found, seeding...');
      await seedWorkspaceChartOfAccounts(workspaceId);
      results.chartOfAccountsSeeded = true;
      const glCount = await prisma.gLAccount.count({ where: { workspaceId } });
      results.glAccountsCreated = glCount;
      console.log(`[MIGRATE-GL] Seeded ${glCount} GL accounts`);
    } else {
      console.log('[MIGRATE-GL] Chart of Accounts already exists');
    }

    // Step 1: Link categories to GL accounts
    console.log('[MIGRATE-GL] Step 1: Linking categories to GL accounts...');
    results.categoriesLinked = await linkCategoriesToGLAccounts(workspaceId);
    console.log(`[MIGRATE-GL] Linked ${results.categoriesLinked} categories`);

    // Step 2: Link bank accounts to GL accounts
    console.log('[MIGRATE-GL] Step 2: Linking bank accounts to GL accounts...');
    results.bankAccountsLinked = await linkBankAccountsToGL(workspaceId);
    console.log(`[MIGRATE-GL] Linked ${results.bankAccountsLinked} bank accounts`);

    // Step 3: Get all approved categorizations that don't have GL entries yet
    console.log('[MIGRATE-GL] Step 3: Creating GL entries for existing transactions...');

    const categorizations = await prisma.transactionCategorization.findMany({
      where: {
        workspaceId,
        approved: true,
      },
      include: {
        transaction: {
          include: {
            bankAccount: {
              include: { glAccount: true },
            },
          },
        },
        category: {
          include: { glAccount: true },
        },
      },
    });

    console.log(`[MIGRATE-GL] Found ${categorizations.length} approved categorizations`);

    // Get next entry number
    let entrySequence = await getNextEntrySequence(workspaceId);

    for (const cat of categorizations) {
      const { transaction, category } = cat;

      // Skip if missing GL mappings
      if (!category.glAccountId || !category.glAccount) {
        results.skipped++;
        continue;
      }

      if (!transaction.bankAccount.glAccountId || !transaction.bankAccount.glAccount) {
        results.skipped++;
        continue;
      }

      // Check if already posted
      const existingEntry = await prisma.journalEntry.findFirst({
        where: {
          workspaceId,
          referenceType: 'bank_transaction',
          referenceId: transaction.id,
          status: { not: 'REVERSED' },
        },
      });

      if (existingEntry) {
        results.skipped++;
        continue;
      }

      try {
        // Create journal entry
        const amount = Math.abs(Number(transaction.amount));
        const isIncome = Number(transaction.amount) > 0;
        const entryNumber = `JE-${new Date().getFullYear()}-${String(entrySequence++).padStart(4, '0')}`;

        const lines: JournalLine[] = isIncome
          ? [
              // DR Bank
              {
                glAccountId: transaction.bankAccount.glAccountId!,
                description: transaction.description || 'Bank deposit',
                debitAmount: amount,
                creditAmount: 0,
                currency: transaction.currency,
                lineOrder: 1,
              },
              // CR Income
              {
                glAccountId: category.glAccountId,
                description: transaction.description || 'Income',
                debitAmount: 0,
                creditAmount: amount,
                currency: transaction.currency,
                lineOrder: 2,
              },
            ]
          : [
              // DR Expense
              {
                glAccountId: category.glAccountId,
                description: transaction.description || 'Expense',
                debitAmount: amount,
                creditAmount: 0,
                currency: transaction.currency,
                lineOrder: 1,
              },
              // CR Bank
              {
                glAccountId: transaction.bankAccount.glAccountId!,
                description: transaction.description || 'Bank withdrawal',
                debitAmount: 0,
                creditAmount: amount,
                currency: transaction.currency,
                lineOrder: 2,
              },
            ];

        // Validate
        const validation = validateJournalEntry(lines);
        if (!validation.isValid) {
          results.errors.push(`Transaction ${transaction.id}: ${validation.errors.join(', ')}`);
          continue;
        }

        // Create entry
        await prisma.journalEntry.create({
          data: {
            workspaceId,
            entryNumber,
            entryDate: transaction.postedAt,
            description: transaction.description || (isIncome ? 'Income' : 'Expense'),
            referenceType: 'bank_transaction',
            referenceId: transaction.id,
            status: 'POSTED',
            postedAt: new Date(),
            postedBy: user.id,
            lines: {
              create: lines.map((line) => ({
                glAccountId: line.glAccountId,
                description: line.description || '',
                debitAmount: line.debitAmount,
                creditAmount: line.creditAmount,
                currency: line.currency,
                lineOrder: line.lineOrder,
              })),
            },
          },
        });

        results.journalEntriesCreated++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Transaction ${transaction.id}: ${errorMsg}`);
      }
    }

    console.log(
      `[MIGRATE-GL] Complete: ${results.journalEntriesCreated} entries created, ${results.skipped} skipped`
    );

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('GL Migration failed:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

async function getNextEntrySequence(workspaceId: string): Promise<number> {
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
    return 1;
  }

  return parseInt(lastEntry.entryNumber.slice(prefix.length), 10) + 1;
}
