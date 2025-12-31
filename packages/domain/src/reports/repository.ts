/**
 * Report Repository Interface
 *
 * Defines the contract for data access needed by report services.
 * Implementations are provided by the data layer (Prisma adapter).
 */

import type { CurrencyCode, FxRate, UUID } from '@moneio/core-ledger';

import type { AccountType, AgingBucket } from './types';

// ============================================
// GL Account Data
// ============================================

/**
 * GL Account with balance information
 */
export interface GLAccountData {
  id: UUID;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: 'DEBIT' | 'CREDIT';
  parentId?: UUID;
  subType?: string;
  isActive: boolean;
}

/**
 * GL Account balance at a point in time
 */
export interface GLAccountBalance {
  accountId: UUID;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

/**
 * Journal line with entry details
 */
export interface JournalLineData {
  entryId: UUID;
  entryNumber: string;
  entryDate: string;
  description: string;
  accountId: UUID;
  debitAmount: number;
  creditAmount: number;
  referenceType?: string;
  referenceId?: UUID;
  status: string;
}

// ============================================
// Invoice/Transaction Data
// ============================================

/**
 * Invoice for aging reports
 */
export interface InvoiceData {
  id: UUID;
  invoiceNumber?: string;
  merchantId?: UUID;
  merchantName?: string;
  issueDate: string;
  dueDate?: string;
  total: number;
  paidAmount: number;
  currency: CurrencyCode;
  status: string;
  isReceivable: boolean; // true = AR, false = AP
}

/**
 * Transaction summary for reports
 */
export interface ReportTransactionData {
  id: UUID;
  postedAt: string;
  amount: number;
  currency: CurrencyCode;
  categoryId?: UUID;
  categoryName?: string;
  glAccountId?: UUID;
}

// ============================================
// Repository Interface
// ============================================

export interface ReportRepository {
  // GL Account queries
  getGLAccounts(workspaceId: UUID): Promise<GLAccountData[]>;

  getGLAccountBalances(
    workspaceId: UUID,
    asOfDate: string
  ): Promise<GLAccountBalance[]>;

  getGLAccountBalancesForPeriod(
    workspaceId: UUID,
    startDate: string,
    endDate: string
  ): Promise<GLAccountBalance[]>;

  // Journal queries
  getJournalLines(
    workspaceId: UUID,
    startDate: string,
    endDate: string,
    accountIds?: UUID[]
  ): Promise<JournalLineData[]>;

  getJournalLinesForAccount(
    workspaceId: UUID,
    accountId: UUID,
    startDate: string,
    endDate: string
  ): Promise<JournalLineData[]>;

  // Invoice queries (for aging)
  getOutstandingInvoices(
    workspaceId: UUID,
    asOfDate: string,
    type: 'receivables' | 'payables'
  ): Promise<InvoiceData[]>;

  // Transaction queries
  getTransactionsForPeriod(
    workspaceId: UUID,
    startDate: string,
    endDate: string
  ): Promise<ReportTransactionData[]>;

  // FX rates
  getFxRates(baseCurrency: CurrencyCode): Promise<FxRate[]>;

  // Opening balance (sum of all entries before start date)
  getOpeningBalance(
    workspaceId: UUID,
    accountId: UUID,
    beforeDate: string
  ): Promise<number>;

  // Cash accounts balance
  getCashAccountsBalance(
    workspaceId: UUID,
    asOfDate: string
  ): Promise<number>;
}

// ============================================
// Helper Types for Report Building
// ============================================

/**
 * Account tree node for hierarchical reports
 */
export interface AccountTreeNode {
  account: GLAccountData;
  balance: number;
  previousBalance?: number;
  children: AccountTreeNode[];
}

/**
 * Build account hierarchy from flat list
 */
export function buildAccountTree(
  accounts: GLAccountData[],
  balances: Map<UUID, number>,
  previousBalances?: Map<UUID, number>
): AccountTreeNode[] {
  const accountMap = new Map<UUID, GLAccountData>();
  const childrenMap = new Map<UUID, GLAccountData[]>();

  // Index accounts
  for (const account of accounts) {
    accountMap.set(account.id, account);
    if (account.parentId) {
      const siblings = childrenMap.get(account.parentId) || [];
      siblings.push(account);
      childrenMap.set(account.parentId, siblings);
    }
  }

  // Build tree recursively
  function buildNode(account: GLAccountData): AccountTreeNode {
    const children = childrenMap.get(account.id) || [];
    const childNodes = children
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
      .map(buildNode);

    // Sum children balances + own balance
    const ownBalance = balances.get(account.id) || 0;
    const childrenBalance = childNodes.reduce((sum, child) => sum + child.balance, 0);
    const totalBalance = ownBalance + childrenBalance;

    let previousBalance: number | undefined;
    if (previousBalances) {
      const ownPrev = previousBalances.get(account.id) || 0;
      const childrenPrev = childNodes.reduce((sum, child) => sum + (child.previousBalance || 0), 0);
      previousBalance = ownPrev + childrenPrev;
    }

    return {
      account,
      balance: totalBalance,
      previousBalance,
      children: childNodes,
    };
  }

  // Get root accounts (no parent)
  const rootAccounts = accounts
    .filter((a) => !a.parentId)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  return rootAccounts.map(buildNode);
}

/**
 * Filter tree by account type
 */
export function filterTreeByType(
  tree: AccountTreeNode[],
  types: AccountType[]
): AccountTreeNode[] {
  return tree.filter((node) => types.includes(node.account.accountType));
}

/**
 * Flatten tree to list with depth info
 */
export function flattenTree(
  tree: AccountTreeNode[],
  depth = 0
): Array<{ node: AccountTreeNode; depth: number }> {
  const result: Array<{ node: AccountTreeNode; depth: number }> = [];

  for (const node of tree) {
    result.push({ node, depth });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }

  return result;
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get bucket for number of days
 */
export function getBucketForDays(days: number, buckets: AgingBucket[]): string {
  for (const bucket of buckets) {
    if (bucket.maxDays === null) {
      if (days >= bucket.minDays) return bucket.label;
    } else {
      if (days >= bucket.minDays && days <= bucket.maxDays) return bucket.label;
    }
  }
  return buckets[buckets.length - 1].label;
}
