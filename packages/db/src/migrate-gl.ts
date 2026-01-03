/**
 * GL Migration Script
 *
 * Run with: pnpm --filter @moneio/db db:migrate-gl -- --all
 */

import { prisma } from './client';
import {
  hasChartOfAccounts,
  linkBankAccountsToGL,
  linkCategoriesToGLAccounts,
  seedWorkspaceChartOfAccounts,
} from './gl-seed';

// Inline JournalLine type to avoid import issues
interface JournalLine {
  glAccountId: string;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  currency: string;
  lineOrder: number;
}

// Inline validation to avoid import issues
function validateJournalEntry(lines: JournalLine[]): {
  isValid: boolean;
  errors: string[];
  totalDebits: number;
  totalCredits: number;
} {
  const errors: string[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  if (lines.length < 2) {
    errors.push('Journal entry must have at least 2 lines');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.debitAmount < 0 || line.creditAmount < 0) {
      errors.push(`Line ${i + 1}: Amounts cannot be negative`);
    }
    if (line.debitAmount > 0 && line.creditAmount > 0) {
      errors.push(`Line ${i + 1}: Cannot have both debit and credit amounts`);
    }
    if (line.debitAmount === 0 && line.creditAmount === 0) {
      errors.push(`Line ${i + 1}: Must have either debit or credit amount`);
    }
    totalDebits += line.debitAmount;
    totalCredits += line.creditAmount;
  }

  const difference = Math.abs(totalDebits - totalCredits);
  if (difference > 0.01) {
    errors.push(`Debits (${totalDebits.toFixed(2)}) must equal credits (${totalCredits.toFixed(2)})`);
  }

  return { isValid: errors.length === 0, errors, totalDebits, totalCredits };
}

interface MigrationResult {
  workspaceId: string;
  workspaceName: string;
  chartOfAccountsSeeded: boolean;
  glAccountsCreated: number;
  categoriesLinked: number;
  bankAccountsLinked: number;
  journalEntriesCreated: number;
  skipped: number;
  errors: string[];
}

async function migrateWorkspace(workspaceId: string): Promise<MigrationResult> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const result: MigrationResult = {
    workspaceId,
    workspaceName: workspace.name,
    chartOfAccountsSeeded: false,
    glAccountsCreated: 0,
    categoriesLinked: 0,
    bankAccountsLinked: 0,
    journalEntriesCreated: 0,
    skipped: 0,
    errors: [],
  };

  console.log(`\n=== Migrating workspace: ${workspace.name} (${workspaceId}) ===\n`);

  // Step 0: Seed Chart of Accounts
  console.log('Step 0: Checking Chart of Accounts...');
  const hasCoA = await hasChartOfAccounts(workspaceId);
  if (!hasCoA) {
    console.log('  No Chart of Accounts found, seeding...');
    await seedWorkspaceChartOfAccounts(workspaceId);
    result.chartOfAccountsSeeded = true;
    const glCount = await prisma.gLAccount.count({ where: { workspaceId } });
    result.glAccountsCreated = glCount;
    console.log(`  Created ${glCount} GL accounts`);
  } else {
    console.log('  Chart of Accounts already exists');
  }

  // Step 1: Link categories to GL accounts
  console.log('\nStep 1: Linking categories to GL accounts...');
  result.categoriesLinked = await linkCategoriesToGLAccounts(workspaceId);
  console.log(`  Linked ${result.categoriesLinked} categories`);

  // Step 2: Link bank accounts to GL accounts
  console.log('\nStep 2: Linking bank accounts to GL accounts...');
  result.bankAccountsLinked = await linkBankAccountsToGL(workspaceId);
  console.log(`  Linked ${result.bankAccountsLinked} bank accounts`);

  // Step 3: Create journal entries for existing categorizations
  console.log('\nStep 3: Creating journal entries for existing categorizations...');

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

  console.log(`  Found ${categorizations.length} approved categorizations`);

  let entrySequence = await getNextEntrySequence(workspaceId);
  let processed = 0;

  for (const cat of categorizations) {
    const { transaction, category } = cat;

    // Skip if missing GL mappings
    if (!category.glAccountId || !category.glAccount) {
      result.skipped++;
      continue;
    }

    if (!transaction.bankAccount.glAccountId || !transaction.bankAccount.glAccount) {
      result.skipped++;
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
      result.skipped++;
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
        result.errors.push(`Transaction ${transaction.id}: ${validation.errors.join(', ')}`);
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
          postedBy: null, // System migration
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

      result.journalEntriesCreated++;
      processed++;

      // Progress indicator
      if (processed % 100 === 0) {
        console.log(`  Progress: ${processed}/${categorizations.length}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Transaction ${transaction.id}: ${errorMsg}`);
    }
  }

  console.log(`\n  Created ${result.journalEntriesCreated} journal entries`);
  console.log(`  Skipped ${result.skipped} (missing GL mappings or already posted)`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
  }

  return result;
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npx ts-node --esm packages/db/src/migrate-gl.ts <workspaceId>');
    console.log('  npx ts-node --esm packages/db/src/migrate-gl.ts --all');
    process.exit(1);
  }

  const results: MigrationResult[] = [];

  if (args[0] === '--all') {
    console.log('Migrating all workspaces...\n');
    const workspaces = await prisma.workspace.findMany({
      select: { id: true },
    });

    for (const ws of workspaces) {
      try {
        const result = await migrateWorkspace(ws.id);
        results.push(result);
      } catch (error) {
        console.error(`Failed to migrate workspace ${ws.id}:`, error);
      }
    }
  } else {
    try {
      const result = await migrateWorkspace(args[0]);
      results.push(result);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================\n');

  for (const r of results) {
    console.log(`${r.workspaceName}:`);
    console.log(`  Chart of Accounts seeded: ${r.chartOfAccountsSeeded ? `Yes (${r.glAccountsCreated} accounts)` : 'Already existed'}`);
    console.log(`  Categories linked: ${r.categoriesLinked}`);
    console.log(`  Bank accounts linked: ${r.bankAccountsLinked}`);
    console.log(`  Journal entries created: ${r.journalEntriesCreated}`);
    console.log(`  Skipped: ${r.skipped}`);
    if (r.errors.length > 0) {
      console.log(`  Errors: ${r.errors.length}`);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
