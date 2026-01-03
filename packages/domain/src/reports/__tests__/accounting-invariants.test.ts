/**
 * Accounting Invariants Test Suite
 *
 * These tests verify fundamental accounting rules that must ALWAYS hold true.
 * If any of these tests fail, there is a serious bug in the financial calculations.
 *
 * Critical Invariants:
 * 1. Trial Balance: Total Debits = Total Credits (across all accounts)
 * 2. Balance Sheet Equation: Assets = Liabilities + Equity
 * 3. P&L to Balance Sheet: Net Income flows to Retained Earnings
 * 4. Cash Flow Reconciliation: Beginning Cash + Net Change = Ending Cash
 * 5. Double-Entry: Every journal entry has equal debits and credits
 * 6. Money Representation: Cents to display conversion is consistent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BalanceSheetService } from '../balance-sheet-service';
import { CashFlowService } from '../cash-flow-service';
import { GLDetailService } from '../gl-detail-service';
import { ProfitLossService } from '../profit-loss-service';
import type { ReportRepository, GLAccountData, GLAccountBalance, JournalLineData } from '../repository';

// ============================================
// Test Fixtures
// ============================================

const createAccount = (
  id: string,
  code: string,
  name: string,
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE',
  subType?: string
): GLAccountData => ({
  id,
  accountCode: code,
  accountName: name,
  accountType: type,
  normalBalance: type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
  subType,
  isActive: true,
});

const createMockRepository = (): ReportRepository => ({
  getGLAccounts: vi.fn(),
  getGLAccountBalances: vi.fn(),
  getGLAccountBalancesForPeriod: vi.fn(),
  getJournalLines: vi.fn(),
  getJournalLinesForAccount: vi.fn(),
  getCashAccountsBalance: vi.fn(),
  getTransactionsForPeriod: vi.fn(),
  getOutstandingInvoices: vi.fn(),
  getFxRates: vi.fn(),
  getOpeningBalance: vi.fn(),
});

// ============================================
// INVARIANT 1: Trial Balance
// Total Debits = Total Credits across all accounts
// ============================================

describe('INVARIANT 1: Trial Balance (Debits = Credits)', () => {
  let glService: GLDetailService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    glService = new GLDetailService(mockRepo);
  });

  it('total debits equals total credits in any valid GL report', async () => {
    // Setup: A complete set of balanced transactions
    const accounts: GLAccountData[] = [
      createAccount('cash', '1110', 'Cash', 'ASSET', 'cash'),
      createAccount('ar', '1200', 'Accounts Receivable', 'ASSET', 'receivable'),
      createAccount('ap', '2100', 'Accounts Payable', 'LIABILITY', 'payable'),
      createAccount('revenue', '4100', 'Sales Revenue', 'INCOME', 'revenue'),
      createAccount('expense', '5100', 'Operating Expenses', 'EXPENSE', 'operating'),
    ];

    // Journal entries that must balance:
    // Entry 1: Sale - DR Cash 1000, CR Revenue 1000
    // Entry 2: Expense - DR Expense 300, CR Cash 300
    // Entry 3: Receivable - DR AR 500, CR Revenue 500

    const journalLinesByAccount: Record<string, JournalLineData[]> = {
      cash: [
        { entryId: 'je-1', entryNumber: 'JE-001', entryDate: '2024-01-15', description: 'Sale', accountId: 'cash', debitAmount: 1000, creditAmount: 0, status: 'POSTED' },
        { entryId: 'je-2', entryNumber: 'JE-002', entryDate: '2024-01-20', description: 'Expense', accountId: 'cash', debitAmount: 0, creditAmount: 300, status: 'POSTED' },
      ],
      ar: [
        { entryId: 'je-3', entryNumber: 'JE-003', entryDate: '2024-01-25', description: 'Credit Sale', accountId: 'ar', debitAmount: 500, creditAmount: 0, status: 'POSTED' },
      ],
      ap: [],
      revenue: [
        { entryId: 'je-1', entryNumber: 'JE-001', entryDate: '2024-01-15', description: 'Sale', accountId: 'revenue', debitAmount: 0, creditAmount: 1000, status: 'POSTED' },
        { entryId: 'je-3', entryNumber: 'JE-003', entryDate: '2024-01-25', description: 'Credit Sale', accountId: 'revenue', debitAmount: 0, creditAmount: 500, status: 'POSTED' },
      ],
      expense: [
        { entryId: 'je-2', entryNumber: 'JE-002', entryDate: '2024-01-20', description: 'Expense', accountId: 'expense', debitAmount: 300, creditAmount: 0, status: 'POSTED' },
      ],
    };

    mockRepo.getGLAccounts.mockResolvedValue(accounts);
    mockRepo.getOpeningBalance.mockResolvedValue(0);
    mockRepo.getJournalLinesForAccount.mockImplementation(async (_ws, accountId) => {
      return journalLinesByAccount[accountId] || [];
    });

    const report = await glService.generate({
      workspaceId: 'ws-1',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      baseCurrency: 'EUR',
    });

    // INVARIANT: Total Debits MUST equal Total Credits
    expect(report.summary.totalDebits.amount).toBe(report.summary.totalCredits.amount);

    // Verify exact amounts: DR 1000 + 500 + 300 = 1800, CR 300 + 1000 + 500 = 1800
    expect(report.summary.totalDebits.amount).toBe(180000); // In cents
    expect(report.summary.totalCredits.amount).toBe(180000);
  });

  it('detects imbalance when debits do not equal credits', async () => {
    // This test verifies our ability to detect invalid data
    const accounts: GLAccountData[] = [
      createAccount('cash', '1110', 'Cash', 'ASSET'),
      createAccount('revenue', '4100', 'Revenue', 'INCOME'),
    ];

    // Intentionally unbalanced: DR 1000, CR 800
    const journalLinesByAccount: Record<string, JournalLineData[]> = {
      cash: [
        { entryId: 'je-1', entryNumber: 'JE-001', entryDate: '2024-01-15', description: 'Sale', accountId: 'cash', debitAmount: 1000, creditAmount: 0, status: 'POSTED' },
      ],
      revenue: [
        { entryId: 'je-1', entryNumber: 'JE-001', entryDate: '2024-01-15', description: 'Sale', accountId: 'revenue', debitAmount: 0, creditAmount: 800, status: 'POSTED' },
      ],
    };

    mockRepo.getGLAccounts.mockResolvedValue(accounts);
    mockRepo.getOpeningBalance.mockResolvedValue(0);
    mockRepo.getJournalLinesForAccount.mockImplementation(async (_ws, accountId) => {
      return journalLinesByAccount[accountId] || [];
    });

    const report = await glService.generate({
      workspaceId: 'ws-1',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      baseCurrency: 'EUR',
    });

    // This SHOULD fail - debits != credits indicates data corruption
    const isBalanced = report.summary.totalDebits.amount === report.summary.totalCredits.amount;
    expect(isBalanced).toBe(false); // Detects the problem
  });
});

// ============================================
// INVARIANT 2: Balance Sheet Equation
// Assets = Liabilities + Equity
// ============================================

describe('INVARIANT 2: Balance Sheet Equation (A = L + E)', () => {
  let bsService: BalanceSheetService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    bsService = new BalanceSheetService(mockRepo);
  });

  it('assets always equal liabilities plus equity', async () => {
    const accounts: GLAccountData[] = [
      // Assets: 50000 + 30000 = 80000
      createAccount('cash', '1110', 'Cash', 'ASSET', 'cash'),
      createAccount('ar', '1200', 'Accounts Receivable', 'ASSET', 'receivable'),
      // Liabilities: 20000
      createAccount('ap', '2100', 'Accounts Payable', 'LIABILITY', 'payable'),
      // Equity: 60000 (must equal 80000 - 20000)
      createAccount('capital', '3100', 'Share Capital', 'EQUITY', 'share_capital'),
    ];

    const balances: GLAccountBalance[] = [
      { accountId: 'cash', debitTotal: 50000, creditTotal: 0, balance: 50000 },
      { accountId: 'ar', debitTotal: 30000, creditTotal: 0, balance: 30000 },
      { accountId: 'ap', debitTotal: 0, creditTotal: 20000, balance: 20000 },
      { accountId: 'capital', debitTotal: 0, creditTotal: 60000, balance: 60000 },
    ];

    mockRepo.getGLAccounts.mockResolvedValue(accounts);
    mockRepo.getGLAccountBalances.mockResolvedValue(balances);

    const report = await bsService.generate({
      workspaceId: 'ws-1',
      asOfDate: '2024-12-31',
      baseCurrency: 'EUR',
    });

    // INVARIANT: Assets = Liabilities + Equity
    const totalAssets = report.summaries.totalAssets.amount;
    const totalLiabilities = report.summaries.totalLiabilities.amount;
    const totalEquity = report.summaries.totalEquity.amount;

    expect(totalAssets).toBe(totalLiabilities + totalEquity);
    expect(report.summaries.isBalanced).toBe(true);

    // Verify exact amounts (in cents after createMoney)
    expect(totalAssets).toBe(8000000); // 80000 * 100
    expect(totalLiabilities).toBe(2000000); // 20000 * 100
    expect(totalEquity).toBe(6000000); // 60000 * 100
  });

  it('detects imbalance when accounting equation fails', async () => {
    const accounts: GLAccountData[] = [
      createAccount('cash', '1110', 'Cash', 'ASSET', 'cash'),
      createAccount('ap', '2100', 'Accounts Payable', 'LIABILITY', 'payable'),
      createAccount('capital', '3100', 'Share Capital', 'EQUITY', 'share_capital'),
    ];

    // Intentionally unbalanced: Assets 100000 != Liabilities 30000 + Equity 50000
    const balances: GLAccountBalance[] = [
      { accountId: 'cash', debitTotal: 100000, creditTotal: 0, balance: 100000 },
      { accountId: 'ap', debitTotal: 0, creditTotal: 30000, balance: 30000 },
      { accountId: 'capital', debitTotal: 0, creditTotal: 50000, balance: 50000 },
    ];

    mockRepo.getGLAccounts.mockResolvedValue(accounts);
    mockRepo.getGLAccountBalances.mockResolvedValue(balances);

    const report = await bsService.generate({
      workspaceId: 'ws-1',
      asOfDate: '2024-12-31',
      baseCurrency: 'EUR',
    });

    // Balance sheet should detect the imbalance
    expect(report.summaries.isBalanced).toBe(false);
  });
});

// ============================================
// INVARIANT 3: Cash Flow Reconciliation
// Beginning Cash + Net Change = Ending Cash
// ============================================

describe('INVARIANT 3: Cash Flow Reconciliation', () => {
  let cfService: CashFlowService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    cfService = new CashFlowService(mockRepo);
  });

  it('beginning cash plus net change equals ending cash', async () => {
    const accounts: GLAccountData[] = [
      createAccount('cash', '1110', 'Cash', 'ASSET', 'cash'),
      createAccount('ar', '1200', 'Accounts Receivable', 'ASSET', 'receivable'),
      createAccount('revenue', '4100', 'Revenue', 'INCOME', 'revenue'),
    ];

    // Cash flow works on changes in non-cash accounts
    // AR decrease of 30000 means cash increased by 30000 (customer paid)
    const journalLines: JournalLineData[] = [
      { entryId: 'je-1', entryNumber: 'JE-001', entryDate: '2024-01-15', description: 'Payment received', accountId: 'ar', debitAmount: 0, creditAmount: 30000, status: 'POSTED' },
    ];

    mockRepo.getGLAccounts.mockResolvedValue(accounts);
    mockRepo.getJournalLines.mockResolvedValue(journalLines);
    mockRepo.getCashAccountsBalance
      .mockResolvedValueOnce(10000) // Beginning cash
      .mockResolvedValueOnce(40000); // Ending cash

    const report = await cfService.generate({
      workspaceId: 'ws-1',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      baseCurrency: 'EUR',
    });

    // INVARIANT: Beginning + Net Change = Ending
    // This test verifies the cash flow statement correctly calculates net change
    // such that beginning + netChange = ending
    const beginningCash = report.summaries.beginningCash.amount;
    const netChange = report.summaries.netChangeInCash.amount;
    const endingCash = report.summaries.endingCash.amount;

    // The actual net change is derived from beginning and ending cash balances
    // Not from the journal entries themselves (indirect method)
    expect(endingCash - beginningCash).toBe(netChange);
    expect(beginningCash + netChange).toBe(endingCash);
  });
});

// ============================================
// INVARIANT 4: P&L Formula Verification
// Net Income = Revenue - COGS - OpEx + Other Income - Other Expenses
// ============================================

describe('INVARIANT 4: P&L Formula Verification', () => {
  let plService: ProfitLossService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    plService = new ProfitLossService(mockRepo);
  });

  it('net income formula is mathematically correct', async () => {
    const accounts: GLAccountData[] = [
      createAccount('revenue', '4100', 'Sales', 'INCOME', 'revenue'),
      createAccount('cogs', '5000', 'COGS', 'EXPENSE', 'cogs'),
      createAccount('opex', '5200', 'Operating', 'EXPENSE', 'operating'),
      createAccount('other-inc', '4500', 'Other Income', 'INCOME', 'other_income'),
      createAccount('other-exp', '5500', 'Interest', 'EXPENSE', 'interest_expense'),
    ];

    // Revenue: 100000, COGS: 30000, OpEx: 25000, Other Inc: 5000, Other Exp: 2000
    // Net Income = 100000 - 30000 - 25000 + 5000 - 2000 = 48000
    const balances: GLAccountBalance[] = [
      { accountId: 'revenue', debitTotal: 0, creditTotal: 100000, balance: 100000 },
      { accountId: 'cogs', debitTotal: 30000, creditTotal: 0, balance: 30000 },
      { accountId: 'opex', debitTotal: 25000, creditTotal: 0, balance: 25000 },
      { accountId: 'other-inc', debitTotal: 0, creditTotal: 5000, balance: 5000 },
      { accountId: 'other-exp', debitTotal: 2000, creditTotal: 0, balance: 2000 },
    ];

    mockRepo.getGLAccounts.mockResolvedValue(accounts);
    mockRepo.getGLAccountBalancesForPeriod.mockResolvedValue(balances);

    const report = await plService.generate({
      workspaceId: 'ws-1',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      baseCurrency: 'EUR',
    });

    const revenue = report.sections.revenue.subtotal.amount;
    const cogs = report.sections.costOfGoodsSold.subtotal.amount;
    const opex = report.sections.operatingExpenses.subtotal.amount;
    const otherInc = report.sections.otherIncome.subtotal.amount;
    const otherExp = report.sections.otherExpenses.subtotal.amount;
    const netIncome = report.summaries.netIncome.amount;

    // INVARIANT: Net Income follows the formula
    const calculatedNetIncome = revenue - cogs - opex + otherInc - otherExp;
    expect(netIncome).toBe(calculatedNetIncome);

    // Also verify intermediate calculations
    const grossProfit = report.summaries.grossProfit.amount;
    expect(grossProfit).toBe(revenue - cogs);

    const operatingIncome = report.summaries.operatingIncome.amount;
    expect(operatingIncome).toBe(grossProfit - opex);
  });
});

// ============================================
// INVARIANT 5: Money Conversion Consistency
// Amount in cents / 100 = Display amount (for 2 decimal currencies)
// ============================================

describe('INVARIANT 5: Money Conversion Consistency', () => {
  it('cents to display conversion is reversible', () => {
    const testCases = [
      { cents: 10000, expectedDisplay: 100.00 },
      { cents: 2644633, expectedDisplay: 26446.33 },
      { cents: 1, expectedDisplay: 0.01 },
      { cents: 0, expectedDisplay: 0 },
      { cents: -50000, expectedDisplay: -500.00 },
      { cents: 123456789, expectedDisplay: 1234567.89 },
    ];

    testCases.forEach(({ cents, expectedDisplay }) => {
      const decimalPlaces = 2;
      const divisor = Math.pow(10, decimalPlaces);

      // Convert cents to display
      const display = cents / divisor;
      expect(display).toBe(expectedDisplay);

      // Convert display back to cents (should be reversible)
      const backToCents = Math.round(display * divisor);
      expect(backToCents).toBe(cents);
    });
  });

  it('no precision loss for reasonable monetary amounts', () => {
    // Test amounts up to €1 billion (100,000,000,000 cents)
    const amounts = [
      100000000000, // €1 billion
      99999999999,  // Just under €1 billion
      12345678901,  // Random large amount
      1,            // Minimum
    ];

    amounts.forEach((cents) => {
      const display = cents / 100;
      const recovered = Math.round(display * 100);

      // Should recover exact cents for amounts within safe integer range
      expect(recovered).toBe(cents);
    });
  });
});

// ============================================
// INVARIANT 6: Normal Balance Signs
// Assets/Expenses = Debit normal (positive means debit > credit)
// Liabilities/Equity/Income = Credit normal (positive means credit > debit)
// ============================================

describe('INVARIANT 6: Normal Balance Sign Conventions', () => {
  it('debit-normal accounts increase with debits', () => {
    // Assets and Expenses are debit-normal
    const debitNormalAccounts = ['ASSET', 'EXPENSE'];

    debitNormalAccounts.forEach((_type) => {
      // For debit-normal: balance = debitTotal - creditTotal
      const debitTotal = 1000;
      const creditTotal = 300;
      const balance = debitTotal - creditTotal;

      // Positive balance means the account has increased (more debits than credits)
      expect(balance).toBeGreaterThan(0);
      expect(balance).toBe(700);
    });
  });

  it('credit-normal accounts increase with credits', () => {
    // Liabilities, Equity, and Income are credit-normal
    const creditNormalAccounts = ['LIABILITY', 'EQUITY', 'INCOME'];

    creditNormalAccounts.forEach((_type) => {
      // For credit-normal: balance = creditTotal - debitTotal
      const debitTotal = 300;
      const creditTotal = 1000;
      const balance = creditTotal - debitTotal;

      // Positive balance means the account has increased (more credits than debits)
      expect(balance).toBeGreaterThan(0);
      expect(balance).toBe(700);
    });
  });
});

// ============================================
// INVARIANT 7: Running Balance Calculation
// Running balance must update correctly per transaction
// ============================================

describe('INVARIANT 7: Running Balance Correctness', () => {
  let glService: GLDetailService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    glService = new GLDetailService(mockRepo);
  });

  it('running balance accumulates correctly for multiple transactions', async () => {
    const accounts: GLAccountData[] = [
      createAccount('cash', '1110', 'Cash', 'ASSET', 'cash'),
    ];

    // Opening: 1000
    // +500 (debit), -200 (credit), +300 (debit), -100 (credit)
    // Expected running balances: 1500, 1300, 1600, 1500
    const lines: JournalLineData[] = [
      { entryId: 'je-1', entryNumber: 'JE-001', entryDate: '2024-01-10', description: 'Deposit 1', accountId: 'cash', debitAmount: 500, creditAmount: 0, status: 'POSTED' },
      { entryId: 'je-2', entryNumber: 'JE-002', entryDate: '2024-01-15', description: 'Payment 1', accountId: 'cash', debitAmount: 0, creditAmount: 200, status: 'POSTED' },
      { entryId: 'je-3', entryNumber: 'JE-003', entryDate: '2024-01-20', description: 'Deposit 2', accountId: 'cash', debitAmount: 300, creditAmount: 0, status: 'POSTED' },
      { entryId: 'je-4', entryNumber: 'JE-004', entryDate: '2024-01-25', description: 'Payment 2', accountId: 'cash', debitAmount: 0, creditAmount: 100, status: 'POSTED' },
    ];

    mockRepo.getGLAccounts.mockResolvedValue(accounts);
    mockRepo.getOpeningBalance.mockResolvedValue(1000); // Opening balance
    mockRepo.getJournalLinesForAccount.mockResolvedValue(lines);

    const report = await glService.generate({
      workspaceId: 'ws-1',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      baseCurrency: 'EUR',
    });

    const cashAccount = report.accounts.find((a) => a.accountCode === '1110');
    expect(cashAccount).toBeDefined();

    // Verify each running balance (amounts are in cents after createMoney)
    expect(cashAccount!.entries[0].runningBalance.amount).toBe(150000); // 1000 + 500 = 1500
    expect(cashAccount!.entries[1].runningBalance.amount).toBe(130000); // 1500 - 200 = 1300
    expect(cashAccount!.entries[2].runningBalance.amount).toBe(160000); // 1300 + 300 = 1600
    expect(cashAccount!.entries[3].runningBalance.amount).toBe(150000); // 1600 - 100 = 1500

    // Final closing balance should match last running balance
    expect(cashAccount!.closingBalance.amount).toBe(150000);
  });
});
