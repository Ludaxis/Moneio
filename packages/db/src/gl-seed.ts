/**
 * General Ledger Seed Data
 *
 * Default Chart of Accounts structure for new workspaces
 * Including category-to-GL account mappings for automatic GL posting
 */

import type { AccountType, NormalBalance } from '@prisma/client';

import { prisma } from './client';

// ============================================================
// Category to GL Account Mappings
// ============================================================

/**
 * Default mappings from category names to GL account codes
 * Used when seeding default categories to auto-link them to GL accounts
 */
export const categoryGlMappings: Record<string, string> = {
  // Income categories
  'Sales Revenue': '4100',
  'Service Revenue': '4200',
  'Other Income': '4300',
  'Interest Income': '4300',
  Revenue: '4100',
  Income: '4100',

  // Expense categories - Operating
  'Salaries & Wages': '5230',
  Payroll: '5230',
  Rent: '5210',
  'Rent Expense': '5210',
  Utilities: '5220',
  'Office Supplies': '5240',
  'Professional Services': '5250',
  Consulting: '5250',
  Legal: '5250',
  Accounting: '5250',
  Insurance: '5260',
  'Marketing & Advertising': '5270',
  Marketing: '5270',
  Advertising: '5270',
  'Travel & Entertainment': '5280',
  Travel: '5280',

  // Expense categories - Other
  'Bank Fees': '5310',
  'Interest Expense': '5320',

  // Generic fallbacks
  Expenses: '5200', // Operating Expenses parent
  'Operating Expenses': '5200',
};

interface DefaultAccount {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subType?: string;
  normalBalance: NormalBalance;
  parentCode?: string;
  description?: string;
  isSystem?: boolean;
}

/**
 * Default Chart of Accounts
 * Based on standard accounting principles
 */
export const defaultChartOfAccounts: DefaultAccount[] = [
  // ============================================================
  // 1000 - ASSETS
  // ============================================================
  {
    accountCode: '1000',
    accountName: 'Assets',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isSystem: true,
  },
  // Current Assets
  {
    accountCode: '1100',
    accountName: 'Current Assets',
    accountType: 'ASSET',
    subType: 'Current',
    normalBalance: 'DEBIT',
    parentCode: '1000',
  },
  {
    accountCode: '1110',
    accountName: 'Cash and Bank',
    accountType: 'ASSET',
    subType: 'Current',
    normalBalance: 'DEBIT',
    parentCode: '1100',
    description: 'Cash on hand and bank accounts',
  },
  {
    accountCode: '1120',
    accountName: 'Accounts Receivable',
    accountType: 'ASSET',
    subType: 'Current',
    normalBalance: 'DEBIT',
    parentCode: '1100',
    description: 'Amounts owed by customers',
  },
  {
    accountCode: '1130',
    accountName: 'Inventory',
    accountType: 'ASSET',
    subType: 'Current',
    normalBalance: 'DEBIT',
    parentCode: '1100',
    description: 'Goods held for sale',
  },
  {
    accountCode: '1140',
    accountName: 'Prepaid Expenses',
    accountType: 'ASSET',
    subType: 'Current',
    normalBalance: 'DEBIT',
    parentCode: '1100',
    description: 'Expenses paid in advance',
  },
  // Non-Current Assets
  {
    accountCode: '1200',
    accountName: 'Non-Current Assets',
    accountType: 'ASSET',
    subType: 'Non-Current',
    normalBalance: 'DEBIT',
    parentCode: '1000',
  },
  {
    accountCode: '1210',
    accountName: 'Property, Plant & Equipment',
    accountType: 'ASSET',
    subType: 'Non-Current',
    normalBalance: 'DEBIT',
    parentCode: '1200',
    description: 'Tangible fixed assets',
  },
  {
    accountCode: '1220',
    accountName: 'Accumulated Depreciation',
    accountType: 'ASSET',
    subType: 'Non-Current',
    normalBalance: 'CREDIT',
    parentCode: '1200',
    description: 'Contra-asset for depreciation',
  },
  {
    accountCode: '1230',
    accountName: 'Intangible Assets',
    accountType: 'ASSET',
    subType: 'Non-Current',
    normalBalance: 'DEBIT',
    parentCode: '1200',
    description: 'Patents, trademarks, goodwill',
  },

  // ============================================================
  // 2000 - LIABILITIES
  // ============================================================
  {
    accountCode: '2000',
    accountName: 'Liabilities',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    isSystem: true,
  },
  // Current Liabilities
  {
    accountCode: '2100',
    accountName: 'Current Liabilities',
    accountType: 'LIABILITY',
    subType: 'Current',
    normalBalance: 'CREDIT',
    parentCode: '2000',
  },
  {
    accountCode: '2110',
    accountName: 'Accounts Payable',
    accountType: 'LIABILITY',
    subType: 'Current',
    normalBalance: 'CREDIT',
    parentCode: '2100',
    description: 'Amounts owed to suppliers',
  },
  {
    accountCode: '2120',
    accountName: 'Accrued Expenses',
    accountType: 'LIABILITY',
    subType: 'Current',
    normalBalance: 'CREDIT',
    parentCode: '2100',
    description: 'Expenses incurred but not yet paid',
  },
  {
    accountCode: '2130',
    accountName: 'VAT Payable',
    accountType: 'LIABILITY',
    subType: 'Current',
    normalBalance: 'CREDIT',
    parentCode: '2100',
    description: 'Value-added tax liability',
  },
  {
    accountCode: '2140',
    accountName: 'Wages Payable',
    accountType: 'LIABILITY',
    subType: 'Current',
    normalBalance: 'CREDIT',
    parentCode: '2100',
    description: 'Wages owed to employees',
  },
  // Non-Current Liabilities
  {
    accountCode: '2200',
    accountName: 'Non-Current Liabilities',
    accountType: 'LIABILITY',
    subType: 'Non-Current',
    normalBalance: 'CREDIT',
    parentCode: '2000',
  },
  {
    accountCode: '2210',
    accountName: 'Long-term Loans',
    accountType: 'LIABILITY',
    subType: 'Non-Current',
    normalBalance: 'CREDIT',
    parentCode: '2200',
    description: 'Bank loans and other long-term debt',
  },

  // ============================================================
  // 3000 - EQUITY
  // ============================================================
  {
    accountCode: '3000',
    accountName: 'Equity',
    accountType: 'EQUITY',
    normalBalance: 'CREDIT',
    isSystem: true,
  },
  {
    accountCode: '3100',
    accountName: 'Share Capital',
    accountType: 'EQUITY',
    normalBalance: 'CREDIT',
    parentCode: '3000',
    description: 'Capital contributed by shareholders',
  },
  {
    accountCode: '3200',
    accountName: 'Retained Earnings',
    accountType: 'EQUITY',
    normalBalance: 'CREDIT',
    parentCode: '3000',
    description: 'Accumulated profits from prior years',
  },
  {
    accountCode: '3300',
    accountName: 'Current Year Earnings',
    accountType: 'EQUITY',
    normalBalance: 'CREDIT',
    parentCode: '3000',
    description: 'Profit or loss for current fiscal year',
  },

  // ============================================================
  // 4000 - INCOME
  // ============================================================
  {
    accountCode: '4000',
    accountName: 'Income',
    accountType: 'INCOME',
    normalBalance: 'CREDIT',
    isSystem: true,
  },
  {
    accountCode: '4100',
    accountName: 'Sales Revenue',
    accountType: 'INCOME',
    normalBalance: 'CREDIT',
    parentCode: '4000',
    description: 'Revenue from product sales',
  },
  {
    accountCode: '4200',
    accountName: 'Service Revenue',
    accountType: 'INCOME',
    normalBalance: 'CREDIT',
    parentCode: '4000',
    description: 'Revenue from services rendered',
  },
  {
    accountCode: '4300',
    accountName: 'Other Income',
    accountType: 'INCOME',
    normalBalance: 'CREDIT',
    parentCode: '4000',
    description: 'Interest, dividends, gains',
  },

  // ============================================================
  // 5000 - EXPENSES
  // ============================================================
  {
    accountCode: '5000',
    accountName: 'Expenses',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    isSystem: true,
  },
  {
    accountCode: '5100',
    accountName: 'Cost of Goods Sold',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5000',
    description: 'Direct costs of products sold',
  },
  // Operating Expenses
  {
    accountCode: '5200',
    accountName: 'Operating Expenses',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5000',
  },
  {
    accountCode: '5210',
    accountName: 'Rent Expense',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Office and facility rent',
  },
  {
    accountCode: '5220',
    accountName: 'Utilities',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Electricity, water, gas, internet',
  },
  {
    accountCode: '5230',
    accountName: 'Salaries & Wages',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Employee compensation',
  },
  {
    accountCode: '5240',
    accountName: 'Office Supplies',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Office supplies and materials',
  },
  {
    accountCode: '5250',
    accountName: 'Professional Services',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Legal, accounting, consulting fees',
  },
  {
    accountCode: '5260',
    accountName: 'Insurance',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Business insurance premiums',
  },
  {
    accountCode: '5270',
    accountName: 'Marketing & Advertising',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Marketing and advertising costs',
  },
  {
    accountCode: '5280',
    accountName: 'Travel & Entertainment',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Business travel and entertainment',
  },
  {
    accountCode: '5290',
    accountName: 'Depreciation Expense',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5200',
    description: 'Depreciation of fixed assets',
  },
  // Other Expenses
  {
    accountCode: '5300',
    accountName: 'Other Expenses',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5000',
  },
  {
    accountCode: '5310',
    accountName: 'Bank Fees',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5300',
    description: 'Bank charges and transaction fees',
  },
  {
    accountCode: '5320',
    accountName: 'Interest Expense',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    parentCode: '5300',
    description: 'Interest on loans and credit',
  },
];

/**
 * Seed the default chart of accounts for a workspace
 */
export async function seedWorkspaceChartOfAccounts(workspaceId: string): Promise<void> {
  // First pass: Create all accounts without parent references
  const accountIdMap = new Map<string, string>();

  for (const account of defaultChartOfAccounts) {
    const created = await prisma.gLAccount.create({
      data: {
        workspaceId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        subType: account.subType,
        normalBalance: account.normalBalance,
        description: account.description,
        isSystem: account.isSystem ?? false,
        isActive: true,
      },
    });
    accountIdMap.set(account.accountCode, created.id);
  }

  // Second pass: Update parent references
  for (const account of defaultChartOfAccounts) {
    if (account.parentCode) {
      const accountId = accountIdMap.get(account.accountCode);
      const parentId = accountIdMap.get(account.parentCode);

      if (accountId && parentId) {
        await prisma.gLAccount.update({
          where: { id: accountId },
          data: { parentId },
        });
      }
    }
  }
}

/**
 * Check if a workspace already has a chart of accounts
 */
export async function hasChartOfAccounts(workspaceId: string): Promise<boolean> {
  const count = await prisma.gLAccount.count({
    where: { workspaceId },
  });
  return count > 0;
}

/**
 * Get the GL account ID for a category name
 * Returns null if no mapping exists
 */
export async function getGLAccountIdForCategory(
  workspaceId: string,
  categoryName: string
): Promise<string | null> {
  const accountCode = categoryGlMappings[categoryName];
  if (!accountCode) return null;

  const account = await prisma.gLAccount.findFirst({
    where: { workspaceId, accountCode },
    select: { id: true },
  });

  return account?.id ?? null;
}

/**
 * Get the default bank GL account (1110 - Cash and Bank)
 */
export async function getDefaultBankGLAccountId(workspaceId: string): Promise<string | null> {
  const account = await prisma.gLAccount.findFirst({
    where: { workspaceId, accountCode: '1110' },
    select: { id: true },
  });

  return account?.id ?? null;
}

/**
 * Link existing categories to their GL accounts based on the default mappings
 * This is useful for migrating existing workspaces
 */
export async function linkCategoriesToGLAccounts(workspaceId: string): Promise<number> {
  let linked = 0;

  // Get all categories without GL mapping
  const categories = await prisma.category.findMany({
    where: { workspaceId, glAccountId: null },
  });

  // Get all GL accounts for the workspace
  const glAccounts = await prisma.gLAccount.findMany({
    where: { workspaceId },
    select: { id: true, accountCode: true },
  });

  const accountCodeToId = new Map(glAccounts.map((a) => [a.accountCode, a.id]));

  for (const category of categories) {
    const accountCode = categoryGlMappings[category.name];
    if (accountCode) {
      const glAccountId = accountCodeToId.get(accountCode);
      if (glAccountId) {
        await prisma.category.update({
          where: { id: category.id },
          data: { glAccountId },
        });
        linked++;
      }
    }
  }

  return linked;
}

/**
 * Link existing bank accounts to their GL account (1110 - Cash and Bank)
 * This is useful for migrating existing workspaces
 */
export async function linkBankAccountsToGL(workspaceId: string): Promise<number> {
  // Get the default bank GL account
  const bankGLAccount = await prisma.gLAccount.findFirst({
    where: { workspaceId, accountCode: '1110' },
    select: { id: true },
  });

  if (!bankGLAccount) return 0;

  // Update all bank accounts without GL mapping
  const result = await prisma.bankAccount.updateMany({
    where: { workspaceId, glAccountId: null },
    data: { glAccountId: bankGLAccount.id },
  });

  return result.count;
}
