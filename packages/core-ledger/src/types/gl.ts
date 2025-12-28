/**
 * General Ledger Types
 *
 * Types for Chart of Accounts, Journal Entries, and Financial Reporting
 */

// ============================================================
// Enums (matching Prisma schema)
// ============================================================

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';
export type PeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED';

// ============================================================
// GL Account (Chart of Accounts)
// ============================================================

export interface GLAccount {
  id: string;
  workspaceId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subType?: string;
  normalBalance: NormalBalance;
  parentId?: string;
  description?: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GLAccountTreeNode extends GLAccount {
  children: GLAccountTreeNode[];
  level: number;
}

// ============================================================
// Journal Entry
// ============================================================

export interface JournalLine {
  id?: string;
  glAccountId: string;
  accountCode?: string;
  accountName?: string;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  currency: string;
  lineOrder: number;
}

export interface JournalEntry {
  id: string;
  workspaceId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  status: JournalStatus;
  postedAt?: string;
  postedBy?: string;
  reversedAt?: string;
  reversedBy?: string;
  lines: JournalLine[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateJournalEntryInput {
  workspaceId: string;
  entryDate: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  lines: Omit<JournalLine, 'id' | 'accountCode' | 'accountName'>[];
}

// ============================================================
// Accounting Period
// ============================================================

export interface AccountingPeriod {
  id: string;
  workspaceId: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  fiscalYear: number;
  status: PeriodStatus;
  closedAt?: string;
  closedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================
// GL Balance
// ============================================================

export interface GLBalance {
  id: string;
  workspaceId: string;
  glAccountId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
  currency: string;
}

// ============================================================
// Trial Balance
// ============================================================

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: number;
  creditBalance: number;
}

export interface TrialBalance {
  asOfDate: string;
  currency: string;
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

// ============================================================
// Account Balance Query
// ============================================================

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  balance: number;
  debitTotal: number;
  creditTotal: number;
  asOfDate: string;
  currency: string;
}

// ============================================================
// Validation Types
// ============================================================

export interface JournalValidationResult {
  isValid: boolean;
  errors: string[];
  totalDebits: number;
  totalCredits: number;
  difference: number;
}

// ============================================================
// Default Chart of Accounts Structure
// ============================================================

export interface DefaultAccountDefinition {
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
 * Determine the normal balance for an account type
 */
export function getNormalBalance(accountType: AccountType): NormalBalance {
  switch (accountType) {
    case 'ASSET':
    case 'EXPENSE':
      return 'DEBIT';
    case 'LIABILITY':
    case 'EQUITY':
    case 'INCOME':
      return 'CREDIT';
  }
}

/**
 * Calculate the balance for an account based on its normal balance
 */
export function calculateBalance(
  debitTotal: number,
  creditTotal: number,
  normalBalance: NormalBalance
): number {
  if (normalBalance === 'DEBIT') {
    return debitTotal - creditTotal;
  } else {
    return creditTotal - debitTotal;
  }
}

/**
 * Validate a journal entry (debits must equal credits)
 */
export function validateJournalEntry(lines: JournalLine[]): JournalValidationResult {
  const errors: string[] = [];

  if (lines.length < 2) {
    errors.push('Journal entry must have at least 2 lines');
  }

  let totalDebits = 0;
  let totalCredits = 0;

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

  // Allow for small floating point differences (up to 0.01)
  if (difference > 0.01) {
    errors.push(
      `Total debits (${totalDebits.toFixed(2)}) must equal total credits (${totalCredits.toFixed(2)})`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalDebits,
    totalCredits,
    difference,
  };
}
