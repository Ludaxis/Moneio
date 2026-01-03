/**
 * General Ledger Detail Service Tests
 *
 * Tests for GL report calculations including:
 * - Opening and closing balances
 * - Running balance calculations
 * - Summary totals
 * - Account filtering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GLDetailService } from '../gl-detail-service';
import type { ReportRepository, GLAccountData, JournalLineData } from '../repository';

// Helper to create GLAccountData
const createAccount = (
  id: string,
  code: string,
  name: string,
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE',
  normalBalance: 'DEBIT' | 'CREDIT' = type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
): GLAccountData => ({
  id,
  accountCode: code,
  accountName: name,
  accountType: type,
  normalBalance,
  isActive: true,
});

// Mock repository
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

describe('GL Detail Service', () => {
  let service: GLDetailService;
  let mockRepository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = new GLDetailService(mockRepository);
  });

  // ============================================
  // Critical Regression Test for 100x Bug
  // ============================================

  describe('summary calculations', () => {
    it('REGRESSION: summary totals should NOT be 100x inflated due to double createMoney call', async () => {
      // Setup: Two accounts each with one journal entry
      const accounts: GLAccountData[] = [
        createAccount('acc-1', '1110', 'Cash', 'ASSET'),
        createAccount('acc-2', '4100', 'Revenue', 'INCOME'),
      ];

      // Repository returns DECIMAL amounts (e.g., 100.00 for €100.00)
      // createMoney converts to cents internally
      const cashLines: JournalLineData[] = [
        {
          entryId: 'je-1',
          entryNumber: 'JE-2024-0001',
          entryDate: '2024-01-15',
          description: 'Sale',
          accountId: 'acc-1',
          debitAmount: 100, // €100.00 as decimal
          creditAmount: 0,
          status: 'POSTED',
        },
      ];

      const revenueLines: JournalLineData[] = [
        {
          entryId: 'je-1',
          entryNumber: 'JE-2024-0001',
          entryDate: '2024-01-15',
          description: 'Sale',
          accountId: 'acc-2',
          debitAmount: 0,
          creditAmount: 100, // €100.00 as decimal
          status: 'POSTED',
        },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getOpeningBalance.mockResolvedValue(0);
      mockRepository.getJournalLinesForAccount
        .mockResolvedValueOnce(cashLines)
        .mockResolvedValueOnce(revenueLines);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      // Total debits should be 10000 cents (€100.00) - createMoney multiplies by 100
      // NOT 1000000 (which would happen if createMoney was called twice on the summary)
      expect(result.summary.totalDebits.amount).toBe(10000);
      expect(result.summary.totalCredits.amount).toBe(10000);

      // Verify proper balance
      expect(result.summary.totalDebits.amount).toBe(result.summary.totalCredits.amount);
    });

    it('correctly aggregates totals across multiple accounts', async () => {
      const accounts: GLAccountData[] = [
        createAccount('acc-1', '1110', 'Cash', 'ASSET'),
        createAccount('acc-2', '5200', 'Expenses', 'EXPENSE'),
      ];

      // Repository returns decimal amounts
      const cashLines: JournalLineData[] = [
        {
          entryId: 'je-1',
          entryNumber: 'JE-2024-0001',
          entryDate: '2024-01-15',
          description: 'Expense payment',
          accountId: 'acc-1',
          debitAmount: 0,
          creditAmount: 500, // €500.00 cash going out
          status: 'POSTED',
        },
      ];

      const expenseLines: JournalLineData[] = [
        {
          entryId: 'je-1',
          entryNumber: 'JE-2024-0001',
          entryDate: '2024-01-15',
          description: 'Expense payment',
          accountId: 'acc-2',
          debitAmount: 500, // €500.00 expense
          creditAmount: 0,
          status: 'POSTED',
        },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getOpeningBalance.mockResolvedValue(0);
      mockRepository.getJournalLinesForAccount
        .mockResolvedValueOnce(cashLines)
        .mockResolvedValueOnce(expenseLines);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      // Debits and credits should balance
      expect(result.summary.totalDebits.amount).toBe(result.summary.totalCredits.amount);
      expect(result.summary.totalDebits.amount).toBe(50000); // €500.00 converted to cents
    });
  });

  // ============================================
  // Running Balance Tests
  // ============================================

  describe('running balance calculations', () => {
    it('calculates running balance correctly for debit-normal accounts', async () => {
      const accounts: GLAccountData[] = [createAccount('cash', '1110', 'Cash', 'ASSET', 'DEBIT')];

      // Repository returns decimal amounts
      const lines: JournalLineData[] = [
        {
          entryId: 'je-1',
          entryNumber: 'JE-2024-0001',
          entryDate: '2024-01-10',
          description: 'Deposit',
          accountId: 'cash',
          debitAmount: 100, // €100.00
          creditAmount: 0,
          status: 'POSTED',
        },
        {
          entryId: 'je-2',
          entryNumber: 'JE-2024-0002',
          entryDate: '2024-01-15',
          description: 'Payment',
          accountId: 'cash',
          debitAmount: 0,
          creditAmount: 30, // €30.00
          status: 'POSTED',
        },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getOpeningBalance.mockResolvedValue(50); // €50.00 opening (decimal)
      mockRepository.getJournalLinesForAccount.mockResolvedValue(lines);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      const cashAccount = result.accounts.find((a) => a.accountCode === '1110');
      expect(cashAccount).toBeDefined();

      // Opening: 50 → 5000 cents
      // After first entry (debit 100 → 10000 cents): 5000 + 10000 = 15000
      // After second entry (credit 30 → 3000 cents): 15000 - 3000 = 12000
      expect(cashAccount!.entries[0].runningBalance.amount).toBe(15000);
      expect(cashAccount!.entries[1].runningBalance.amount).toBe(12000);
      expect(cashAccount!.closingBalance.amount).toBe(12000);
    });

    it('calculates running balance correctly for credit-normal accounts', async () => {
      const accounts: GLAccountData[] = [
        createAccount('revenue', '4100', 'Revenue', 'INCOME', 'CREDIT'),
      ];

      // Repository returns decimal amounts
      const lines: JournalLineData[] = [
        {
          entryId: 'je-1',
          entryNumber: 'JE-2024-0001',
          entryDate: '2024-01-10',
          description: 'Sale 1',
          accountId: 'revenue',
          debitAmount: 0,
          creditAmount: 200, // €200.00
          status: 'POSTED',
        },
        {
          entryId: 'je-2',
          entryNumber: 'JE-2024-0002',
          entryDate: '2024-01-15',
          description: 'Refund',
          accountId: 'revenue',
          debitAmount: 50, // €50.00
          creditAmount: 0,
          status: 'POSTED',
        },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getOpeningBalance.mockResolvedValue(0);
      mockRepository.getJournalLinesForAccount.mockResolvedValue(lines);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      const revenueAccount = result.accounts.find((a) => a.accountCode === '4100');
      expect(revenueAccount).toBeDefined();

      // Opening: 0
      // After first entry (credit 200 → 20000 cents, credit-normal): 0 + 20000 = 20000
      // After second entry (debit 50 → 5000 cents, credit-normal): 20000 - 5000 = 15000
      expect(revenueAccount!.entries[0].runningBalance.amount).toBe(20000);
      expect(revenueAccount!.entries[1].runningBalance.amount).toBe(15000);
      expect(revenueAccount!.closingBalance.amount).toBe(15000);
    });
  });

  // ============================================
  // Account Filtering Tests
  // ============================================

  describe('account filtering', () => {
    it('filters by account IDs when provided', async () => {
      const accounts: GLAccountData[] = [
        createAccount('acc-1', '1110', 'Cash', 'ASSET'),
        createAccount('acc-2', '4100', 'Revenue', 'INCOME'),
        createAccount('acc-3', '5200', 'Expenses', 'EXPENSE'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      // Give accounts opening balances so they're included in results
      mockRepository.getOpeningBalance.mockResolvedValue(100);
      mockRepository.getJournalLinesForAccount.mockResolvedValue([]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
        accountIds: ['acc-1', 'acc-3'],
      });

      // Should only include accounts with matching IDs
      const accountCodes = result.accounts.map((a) => a.accountCode);
      expect(accountCodes).toContain('1110');
      expect(accountCodes).toContain('5200');
      expect(accountCodes).not.toContain('4100');
    });

    it('filters by account types when provided', async () => {
      const accounts: GLAccountData[] = [
        createAccount('acc-1', '1110', 'Cash', 'ASSET'),
        createAccount('acc-2', '4100', 'Revenue', 'INCOME'),
        createAccount('acc-3', '5200', 'Expenses', 'EXPENSE'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      // Give accounts opening balances so they're included in results
      mockRepository.getOpeningBalance.mockResolvedValue(100);
      mockRepository.getJournalLinesForAccount.mockResolvedValue([]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
        accountTypes: ['INCOME', 'EXPENSE'],
      });

      // Should only include INCOME and EXPENSE accounts
      const types = result.accounts.map((a) => a.accountType);
      expect(types).toContain('INCOME');
      expect(types).toContain('EXPENSE');
      expect(types).not.toContain('ASSET');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('handles empty accounts list', async () => {
      mockRepository.getGLAccounts.mockResolvedValue([]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      expect(result.accounts).toHaveLength(0);
      expect(result.summary.totalDebits.amount).toBe(0);
      expect(result.summary.totalCredits.amount).toBe(0);
      expect(result.summary.accountCount).toBe(0);
      expect(result.summary.entryCount).toBe(0);
    });

    it('excludes accounts with no activity and zero opening balance', async () => {
      const accounts: GLAccountData[] = [
        createAccount('acc-1', '1110', 'Cash', 'ASSET'),
        createAccount('acc-2', '4100', 'Revenue', 'INCOME'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getOpeningBalance
        .mockResolvedValueOnce(10000) // Cash has opening balance
        .mockResolvedValueOnce(0); // Revenue has no opening balance
      mockRepository.getJournalLinesForAccount
        .mockResolvedValueOnce([]) // Cash has no entries
        .mockResolvedValueOnce([]); // Revenue has no entries

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      // Only Cash should be included (has opening balance)
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].accountCode).toBe('1110');
    });

    it('includes report metadata', async () => {
      mockRepository.getGLAccounts.mockResolvedValue([]);

      const result = await service.generate({
        workspaceId: 'ws-123',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      expect(result.metadata.workspaceId).toBe('ws-123');
      expect(result.metadata.baseCurrency).toBe('EUR');
      expect(result.metadata.period.start).toBe('2024-01-01');
      expect(result.metadata.period.end).toBe('2024-12-31');
      expect(result.metadata.generatedAt).toBeDefined();
    });
  });
});
