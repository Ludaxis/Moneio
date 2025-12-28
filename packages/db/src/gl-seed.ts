/**
 * General Ledger Seed Data
 *
 * Default Chart of Accounts structure for new workspaces
 */

import type { AccountType, NormalBalance } from '@prisma/client';

import { prisma } from './client';

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
