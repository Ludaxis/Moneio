/**
 * Accounting Report Types
 *
 * Comprehensive type definitions for financial statements and reports
 * following GAAP/IFRS standards.
 */

import type { CurrencyCode, Money, UUID } from '@moneio/core-ledger';

// ============================================
// Common Report Types
// ============================================

/**
 * Standard report period
 */
export interface ReportPeriod {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  label?: string; // e.g., "Q4 2024", "FY 2024"
}

/**
 * Comparison period for comparative reports
 */
export interface ComparativePeriod {
  current: ReportPeriod;
  previous: ReportPeriod;
}

/**
 * Account type classification
 */
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

/**
 * Report format options
 */
export interface ReportOptions {
  /** Include zero-balance accounts */
  includeZeroBalances?: boolean;
  /** Include comparative period */
  comparative?: boolean;
  /** Depth of account hierarchy to show */
  hierarchyDepth?: number;
  /** Group by specific field */
  groupBy?: 'account' | 'category' | 'month';
  /** Currency for display */
  displayCurrency?: CurrencyCode;
}

/**
 * Base report metadata
 */
export interface ReportMetadata {
  generatedAt: string;
  workspaceId: UUID;
  baseCurrency: CurrencyCode;
  period: ReportPeriod;
}

// ============================================
// Profit & Loss Statement Types
// ============================================

/**
 * Line item in P&L statement
 */
export interface ProfitLossLineItem {
  accountId: UUID;
  accountCode: string;
  accountName: string;
  amount: Money;
  previousAmount?: Money;
  change?: Money;
  changePercentage?: number;
  children?: ProfitLossLineItem[];
  depth: number;
  isSubtotal: boolean;
}

/**
 * Section in P&L statement (Revenue, COGS, Operating Expenses, etc.)
 */
export interface ProfitLossSection {
  name: string;
  key: string;
  items: ProfitLossLineItem[];
  subtotal: Money;
  previousSubtotal?: Money;
}

/**
 * Complete Profit & Loss Statement
 */
export interface ProfitLossStatement {
  metadata: ReportMetadata;
  sections: {
    revenue: ProfitLossSection;
    costOfGoodsSold: ProfitLossSection;
    operatingExpenses: ProfitLossSection;
    otherIncome: ProfitLossSection;
    otherExpenses: ProfitLossSection;
  };
  summaries: {
    grossProfit: Money;
    operatingIncome: Money;
    netIncome: Money;
    previousGrossProfit?: Money;
    previousOperatingIncome?: Money;
    previousNetIncome?: Money;
  };
  /** Monthly breakdown for trend analysis */
  monthlyBreakdown?: ProfitLossMonthly[];
}

/**
 * Monthly P&L summary for charts
 */
export interface ProfitLossMonthly {
  month: string; // YYYY-MM
  revenue: number;
  expenses: number;
  netIncome: number;
}

// ============================================
// Balance Sheet Types
// ============================================

/**
 * Line item in Balance Sheet
 */
export interface BalanceSheetLineItem {
  accountId: UUID;
  accountCode: string;
  accountName: string;
  balance: Money;
  previousBalance?: Money;
  change?: Money;
  changePercentage?: number;
  children?: BalanceSheetLineItem[];
  depth: number;
  isSubtotal: boolean;
}

/**
 * Section in Balance Sheet (Assets, Liabilities, Equity)
 */
export interface BalanceSheetSection {
  name: string;
  key: string;
  subsections: BalanceSheetSubsection[];
  total: Money;
  previousTotal?: Money;
}

/**
 * Subsection (e.g., Current Assets, Fixed Assets)
 */
export interface BalanceSheetSubsection {
  name: string;
  key: string;
  items: BalanceSheetLineItem[];
  subtotal: Money;
  previousSubtotal?: Money;
}

/**
 * Complete Balance Sheet
 */
export interface BalanceSheet {
  metadata: ReportMetadata;
  sections: {
    assets: BalanceSheetSection;
    liabilities: BalanceSheetSection;
    equity: BalanceSheetSection;
  };
  summaries: {
    totalAssets: Money;
    totalLiabilities: Money;
    totalEquity: Money;
    totalLiabilitiesAndEquity: Money;
    isBalanced: boolean;
    difference: Money;
    previousTotalAssets?: Money;
    previousTotalLiabilities?: Money;
    previousTotalEquity?: Money;
  };
  /** Key financial ratios */
  ratios?: BalanceSheetRatios;
}

/**
 * Common financial ratios
 */
export interface BalanceSheetRatios {
  currentRatio?: number; // Current Assets / Current Liabilities
  quickRatio?: number; // (Current Assets - Inventory) / Current Liabilities
  debtToEquity?: number; // Total Liabilities / Total Equity
  workingCapital?: Money; // Current Assets - Current Liabilities
}

// ============================================
// Cash Flow Statement Types
// ============================================

/**
 * Line item in Cash Flow Statement
 */
export interface CashFlowLineItem {
  description: string;
  accountId?: UUID;
  amount: Money;
  previousAmount?: Money;
  isSubtotal: boolean;
}

/**
 * Section in Cash Flow Statement
 */
export interface CashFlowSection {
  name: string;
  key: string;
  items: CashFlowLineItem[];
  netCashFlow: Money;
  previousNetCashFlow?: Money;
}

/**
 * Complete Cash Flow Statement (Indirect Method)
 */
export interface CashFlowStatement {
  metadata: ReportMetadata;
  sections: {
    operating: CashFlowSection;
    investing: CashFlowSection;
    financing: CashFlowSection;
  };
  summaries: {
    netCashFromOperating: Money;
    netCashFromInvesting: Money;
    netCashFromFinancing: Money;
    netChangeInCash: Money;
    beginningCash: Money;
    endingCash: Money;
    previousNetChange?: Money;
  };
}

// ============================================
// Aged Receivables/Payables Types
// ============================================

/**
 * Aging bucket configuration
 */
export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null; // null for 90+
}

/**
 * Default aging buckets
 */
export const DEFAULT_AGING_BUCKETS: AgingBucket[] = [
  { label: 'Current', minDays: 0, maxDays: 0 },
  { label: '1-30 Days', minDays: 1, maxDays: 30 },
  { label: '31-60 Days', minDays: 31, maxDays: 60 },
  { label: '61-90 Days', minDays: 61, maxDays: 90 },
  { label: '90+ Days', minDays: 91, maxDays: null },
];

/**
 * Invoice/Bill in aging report
 */
export interface AgingItem {
  id: UUID;
  documentNumber: string;
  counterpartyId?: UUID;
  counterpartyName: string;
  issueDate: string;
  dueDate: string;
  originalAmount: Money;
  outstandingAmount: Money;
  daysOverdue: number;
  bucket: string;
}

/**
 * Summary by counterparty
 */
export interface AgingByCounterparty {
  counterpartyId?: UUID;
  counterpartyName: string;
  items: AgingItem[];
  bucketTotals: Record<string, Money>;
  totalOutstanding: Money;
}

/**
 * Complete Aged Receivables/Payables Report
 */
export interface AgedReport {
  metadata: ReportMetadata;
  type: 'receivables' | 'payables';
  asOfDate: string;
  buckets: AgingBucket[];
  byCounterparty: AgingByCounterparty[];
  bucketSummary: Record<string, Money>;
  totalOutstanding: Money;
  totalOverdue: Money;
  overduePercentage: number;
  averageDaysOutstanding: number;
}

// ============================================
// General Ledger Detail Types
// ============================================

/**
 * Single journal entry line for GL detail
 */
export interface GLDetailEntry {
  entryId: UUID;
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceType?: string;
  referenceId?: UUID;
  debit: Money;
  credit: Money;
  runningBalance: Money;
}

/**
 * GL Detail for a single account
 */
export interface GLAccountDetail {
  accountId: UUID;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingBalance: Money;
  entries: GLDetailEntry[];
  totalDebits: Money;
  totalCredits: Money;
  closingBalance: Money;
}

/**
 * Complete General Ledger Detail Report
 */
export interface GeneralLedgerReport {
  metadata: ReportMetadata;
  accounts: GLAccountDetail[];
  summary: {
    totalDebits: Money;
    totalCredits: Money;
    accountCount: number;
    entryCount: number;
  };
}

// ============================================
// Budget vs Actual Types
// ============================================

/**
 * Budget line item comparison
 */
export interface BudgetComparisonItem {
  accountId?: UUID;
  categoryId?: UUID;
  name: string;
  budgeted: Money;
  actual: Money;
  variance: Money;
  variancePercentage: number;
  isOverBudget: boolean;
}

/**
 * Budget comparison section
 */
export interface BudgetComparisonSection {
  name: string;
  items: BudgetComparisonItem[];
  totalBudgeted: Money;
  totalActual: Money;
  totalVariance: Money;
}

/**
 * Complete Budget vs Actual Report
 */
export interface BudgetVsActualReport {
  metadata: ReportMetadata;
  sections: {
    income: BudgetComparisonSection;
    expenses: BudgetComparisonSection;
  };
  netBudgeted: Money;
  netActual: Money;
  netVariance: Money;
  /** Monthly breakdown */
  monthlyComparison?: {
    month: string;
    budgeted: number;
    actual: number;
  }[];
}

// ============================================
// Trial Balance Types (enhanced)
// ============================================

/**
 * Enhanced Trial Balance row
 */
export interface TrialBalanceRow {
  accountId: UUID;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingDebit: Money;
  openingCredit: Money;
  periodDebit: Money;
  periodCredit: Money;
  closingDebit: Money;
  closingCredit: Money;
}

/**
 * Enhanced Trial Balance Report
 */
export interface TrialBalanceReport {
  metadata: ReportMetadata;
  rows: TrialBalanceRow[];
  totals: {
    openingDebits: Money;
    openingCredits: Money;
    periodDebits: Money;
    periodCredits: Money;
    closingDebits: Money;
    closingCredits: Money;
    isBalanced: boolean;
  };
}

// ============================================
// Report Generation Input Types
// ============================================

/**
 * Input for generating P&L report
 */
export interface ProfitLossInput {
  workspaceId: UUID;
  startDate: string;
  endDate: string;
  baseCurrency: CurrencyCode;
  options?: ReportOptions;
  previousPeriod?: ReportPeriod;
}

/**
 * Input for generating Balance Sheet
 */
export interface BalanceSheetInput {
  workspaceId: UUID;
  asOfDate: string;
  baseCurrency: CurrencyCode;
  options?: ReportOptions;
  previousAsOfDate?: string;
}

/**
 * Input for generating Cash Flow Statement
 */
export interface CashFlowInput {
  workspaceId: UUID;
  startDate: string;
  endDate: string;
  baseCurrency: CurrencyCode;
  options?: ReportOptions;
}

/**
 * Input for generating Aged Report
 */
export interface AgedReportInput {
  workspaceId: UUID;
  asOfDate: string;
  baseCurrency: CurrencyCode;
  type: 'receivables' | 'payables';
  buckets?: AgingBucket[];
}

/**
 * Input for generating GL Detail
 */
export interface GLDetailInput {
  workspaceId: UUID;
  startDate: string;
  endDate: string;
  baseCurrency: CurrencyCode;
  accountIds?: UUID[]; // Filter to specific accounts
  accountTypes?: AccountType[]; // Filter by account type
}
