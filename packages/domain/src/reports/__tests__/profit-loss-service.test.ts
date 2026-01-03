/**
 * Profit & Loss Statement Service Tests
 *
 * Tests for P&L calculations following accounting best practices:
 * - Revenue recognition
 * - Expense classification (COGS, Operating, Other)
 * - Gross profit calculation: Revenue - COGS
 * - Operating income: Gross Profit - Operating Expenses
 * - Net income: Operating Income + Other Income - Other Expenses
 * - Comparative period calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ProfitLossService } from '../profit-loss-service';
import type { ReportRepository, GLAccountData, AccountBalance } from '../repository';

// Helper to create GLAccountData
const createAccount = (
  id: string,
  code: string,
  name: string,
  type: 'INCOME' | 'EXPENSE',
  subType?: string
): GLAccountData => ({
  id,
  accountCode: code,
  accountName: name,
  accountType: type,
  normalBalance: type === 'INCOME' ? 'CREDIT' : 'DEBIT',
  subType,
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

describe('Profit & Loss Service', () => {
  let service: ProfitLossService;
  let mockRepository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = new ProfitLossService(mockRepository);
  });

  // ============================================
  // Core P&L Calculation Tests
  // ============================================

  describe('generate', () => {
    it('calculates gross profit as revenue minus COGS', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Sales Revenue', 'INCOME', 'revenue'),
        createAccount('cogs-1', '5000', 'Cost of Goods Sold', 'EXPENSE', 'cogs'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'rev-1', balance: 100000 }, // Revenue
        { accountId: 'cogs-1', balance: 40000 }, // COGS
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Gross Profit = Revenue - COGS = 100000 - 40000 = 60000
      expect(result.summaries.grossProfit.amount).toBe(6000000);
    });

    it('calculates operating income as gross profit minus operating expenses', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Sales Revenue', 'INCOME', 'revenue'),
        createAccount('cogs-1', '5000', 'Cost of Goods Sold', 'EXPENSE', 'cogs'),
        createAccount('opex-1', '6000', 'Salaries', 'EXPENSE', 'operating'),
        createAccount('opex-2', '6100', 'Rent', 'EXPENSE', 'operating'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'rev-1', balance: 100000 },
        { accountId: 'cogs-1', balance: 40000 },
        { accountId: 'opex-1', balance: 30000 },
        { accountId: 'opex-2', balance: 10000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Gross Profit = 100000 - 40000 = 60000
      // Operating Income = 60000 - 30000 - 10000 = 20000
      expect(result.summaries.grossProfit.amount).toBe(6000000);
      expect(result.summaries.operatingIncome.amount).toBe(2000000);
    });

    it('calculates net income including other income and expenses', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Sales Revenue', 'INCOME', 'revenue'),
        createAccount('other-inc', '4500', 'Interest Income', 'INCOME', 'other_income'),
        createAccount('opex-1', '6000', 'Operating Expenses', 'EXPENSE', 'operating'),
        createAccount('other-exp', '7500', 'Interest Expense', 'EXPENSE', 'interest_expense'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'rev-1', balance: 100000 },
        { accountId: 'other-inc', balance: 5000 },
        { accountId: 'opex-1', balance: 60000 },
        { accountId: 'other-exp', balance: 3000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Gross Profit = 100000 - 0 (no COGS) = 100000
      // Operating Income = 100000 - 60000 = 40000
      // Net Income = 40000 + 5000 - 3000 = 42000
      expect(result.summaries.netIncome.amount).toBe(4200000);
    });
  });

  // ============================================
  // Account Classification Tests
  // ============================================

  describe('account classification', () => {
    it('classifies revenue accounts correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('sales', '4000', 'Product Sales', 'INCOME', 'sales'),
        createAccount('services', '4100', 'Service Revenue', 'INCOME', 'service_revenue'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'sales', balance: 50000 },
        { accountId: 'services', balance: 30000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      expect(result.sections.revenue.subtotal.amount).toBe(8000000);
      expect(result.sections.revenue.items).toHaveLength(2);
    });

    it('classifies COGS accounts correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cogs-1', '5000', 'Cost of Goods Sold', 'EXPENSE', 'cogs'),
        createAccount('cogs-2', '5100', 'Direct Labor', 'EXPENSE', 'direct_cost'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'cogs-1', balance: 25000 },
        { accountId: 'cogs-2', balance: 15000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      expect(result.sections.costOfGoodsSold.subtotal.amount).toBe(4000000);
    });

    it('classifies operating expenses correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('salaries', '6000', 'Salaries', 'EXPENSE', 'operating'),
        createAccount('utilities', '6200', 'Utilities', 'EXPENSE', 'operating'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'salaries', balance: 50000 },
        { accountId: 'utilities', balance: 5000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      expect(result.sections.operatingExpenses.subtotal.amount).toBe(5500000);
    });
  });

  // ============================================
  // Comparative Period Tests
  // ============================================

  describe('comparative periods', () => {
    it('includes previous period data when comparative option is set', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Revenue', 'INCOME', 'revenue'),
      ];

      const currentBalances: AccountBalance[] = [{ accountId: 'rev-1', balance: 120000 }];

      const previousBalances: AccountBalance[] = [{ accountId: 'rev-1', balance: 100000 }];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod
        .mockResolvedValueOnce(currentBalances)
        .mockResolvedValueOnce(previousBalances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
        options: { comparative: true },
        previousPeriod: { start: '2023-01-01', end: '2023-12-31' },
      });

      expect(result.sections.revenue.previousSubtotal).toBeDefined();
      expect(result.sections.revenue.previousSubtotal?.amount).toBe(10000000);
    });

    it('calculates change and change percentage for line items', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Revenue', 'INCOME', 'revenue'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod
        .mockResolvedValueOnce([{ accountId: 'rev-1', balance: 120000 }])
        .mockResolvedValueOnce([{ accountId: 'rev-1', balance: 100000 }]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
        options: { comparative: true },
        previousPeriod: { start: '2023-01-01', end: '2023-12-31' },
      });

      const revenueItem = result.sections.revenue.items[0];
      expect(revenueItem.change?.amount).toBe(2000000);
      expect(revenueItem.changePercentage).toBe(20); // 20% increase
    });
  });

  // ============================================
  // Monthly Breakdown Tests
  // ============================================

  describe('monthly breakdown', () => {
    it('generates monthly breakdown when groupBy month option is set', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Revenue', 'INCOME', 'revenue'),
      ];

      const transactions = [
        { postedAt: '2024-01-15', amount: 10000 },
        { postedAt: '2024-02-15', amount: 12000 },
        { postedAt: '2024-03-15', amount: -5000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([
        { accountId: 'rev-1', balance: 22000 },
      ]);
      mockRepository.getTransactionsForPeriod.mockResolvedValue(transactions);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        baseCurrency: 'USD',
        options: { groupBy: 'month' },
      });

      expect(result.monthlyBreakdown).toBeDefined();
      expect(result.monthlyBreakdown!.length).toBeGreaterThan(0);
    });

    it('calculates monthly net income correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Revenue', 'INCOME', 'revenue'),
      ];

      const transactions = [
        { postedAt: '2024-01-15', amount: 10000 }, // Income
        { postedAt: '2024-01-20', amount: -3000 }, // Expense
        { postedAt: '2024-02-10', amount: 8000 }, // Income
        { postedAt: '2024-02-25', amount: -4000 }, // Expense
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([
        { accountId: 'rev-1', balance: 18000 },
      ]);
      mockRepository.getTransactionsForPeriod.mockResolvedValue(transactions);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-02-29',
        baseCurrency: 'USD',
        options: { groupBy: 'month' },
      });

      const jan = result.monthlyBreakdown?.find((m) => m.month === '2024-01');
      const feb = result.monthlyBreakdown?.find((m) => m.month === '2024-02');

      expect(jan?.revenue).toBe(10000);
      expect(jan?.expenses).toBe(3000);
      expect(jan?.netIncome).toBe(7000);
      expect(feb?.revenue).toBe(8000);
      expect(feb?.expenses).toBe(4000);
      expect(feb?.netIncome).toBe(4000);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('handles empty accounts list', async () => {
      mockRepository.getGLAccounts.mockResolvedValue([]);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      expect(result.sections.revenue.subtotal.amount).toBe(0);
      expect(result.sections.costOfGoodsSold.subtotal.amount).toBe(0);
      expect(result.summaries.netIncome.amount).toBe(0);
    });

    it('handles zero balance accounts', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Revenue', 'INCOME', 'revenue'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([
        { accountId: 'rev-1', balance: 0 },
      ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      expect(result.sections.revenue.subtotal.amount).toBe(0);
    });

    it('uses absolute values for display amounts', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev-1', '4000', 'Revenue', 'INCOME', 'revenue'),
      ];

      // Balance could be stored as negative (credit balance for income)
      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([
        { accountId: 'rev-1', balance: -50000 }, // Credit balance shown as negative
      ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Should display as positive absolute value
      expect(result.sections.revenue.items[0].amount.amount).toBe(5000000);
    });

    it('includes report metadata', async () => {
      mockRepository.getGLAccounts.mockResolvedValue([]);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([]);

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

  // ============================================
  // Accounting Formula Verification Tests
  // ============================================

  describe('accounting formulas', () => {
    it('verifies Gross Profit = Revenue - COGS', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev', '4000', 'Revenue', 'INCOME', 'revenue'),
        createAccount('cogs', '5000', 'COGS', 'EXPENSE', 'cogs'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([
        { accountId: 'rev', balance: 150000 },
        { accountId: 'cogs', balance: 60000 },
      ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const revenue = result.sections.revenue.subtotal.amount;
      const cogs = result.sections.costOfGoodsSold.subtotal.amount;
      const grossProfit = result.summaries.grossProfit.amount;

      expect(grossProfit).toBe(revenue - cogs);
    });

    it('verifies Operating Income = Gross Profit - Operating Expenses', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev', '4000', 'Revenue', 'INCOME', 'revenue'),
        createAccount('cogs', '5000', 'COGS', 'EXPENSE', 'cogs'),
        createAccount('opex', '6000', 'Operating Expenses', 'EXPENSE', 'operating'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([
        { accountId: 'rev', balance: 150000 },
        { accountId: 'cogs', balance: 60000 },
        { accountId: 'opex', balance: 40000 },
      ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const grossProfit = result.summaries.grossProfit.amount;
      const opex = result.sections.operatingExpenses.subtotal.amount;
      const operatingIncome = result.summaries.operatingIncome.amount;

      expect(operatingIncome).toBe(grossProfit - opex);
    });

    it('verifies Net Income = Operating Income + Other Income - Other Expenses', async () => {
      const accounts: GLAccountData[] = [
        createAccount('rev', '4000', 'Revenue', 'INCOME', 'revenue'),
        createAccount('other-inc', '4500', 'Interest Income', 'INCOME', 'other_income'),
        createAccount('opex', '6000', 'Operating Expenses', 'EXPENSE', 'operating'),
        createAccount('other-exp', '7500', 'Interest Expense', 'EXPENSE', 'interest_expense'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalancesForPeriod.mockResolvedValue([
        { accountId: 'rev', balance: 100000 },
        { accountId: 'other-inc', balance: 5000 },
        { accountId: 'opex', balance: 50000 },
        { accountId: 'other-exp', balance: 3000 },
      ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const operatingIncome = result.summaries.operatingIncome.amount;
      const otherIncome = result.sections.otherIncome.subtotal.amount;
      const otherExpenses = result.sections.otherExpenses.subtotal.amount;
      const netIncome = result.summaries.netIncome.amount;

      expect(netIncome).toBe(operatingIncome + otherIncome - otherExpenses);
    });
  });
});
