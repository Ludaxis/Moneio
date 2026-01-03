/**
 * Balance Sheet Service Tests
 *
 * Tests for Balance Sheet calculations following accounting best practices:
 * - The fundamental accounting equation: Assets = Liabilities + Equity
 * - Asset classification (Current vs Fixed)
 * - Liability classification (Current vs Long-term)
 * - Equity classification (Capital vs Retained Earnings)
 * - Financial ratios (Current Ratio, Working Capital)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BalanceSheetService } from '../balance-sheet-service';
import type { ReportRepository, GLAccountData, AccountBalance } from '../repository';

// Helper to create complete GLAccountData
const createAccount = (
  id: string,
  code: string,
  name: string,
  type: 'ASSET' | 'LIABILITY' | 'EQUITY',
  subType?: string
): GLAccountData => ({
  id,
  accountCode: code,
  accountName: name,
  accountType: type,
  normalBalance: type === 'ASSET' ? 'DEBIT' : 'CREDIT',
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

describe('Balance Sheet Service', () => {
  let service: BalanceSheetService;
  let mockRepository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = new BalanceSheetService(mockRepository);
  });

  // ============================================
  // Fundamental Accounting Equation Tests
  // ============================================

  describe('accounting equation: Assets = Liabilities + Equity', () => {
    it('verifies balance sheet is balanced when Assets = Liabilities + Equity', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cash', '1000', 'Cash', 'ASSET', 'cash'),
        createAccount('ar', '1200', 'Accounts Receivable', 'ASSET', 'accounts_receivable'),
        createAccount('ap', '2000', 'Accounts Payable', 'LIABILITY', 'accounts_payable'),
        createAccount('capital', '3000', 'Share Capital', 'EQUITY', 'capital'),
        createAccount('re', '3100', 'Retained Earnings', 'EQUITY', 'retained_earnings'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'cash', balance: 50000 },
        { accountId: 'ar', balance: 30000 },
        { accountId: 'ap', balance: 20000 },
        { accountId: 'capital', balance: 40000 },
        { accountId: 're', balance: 20000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Assets = 50000 + 30000 = 80000 (in decimal)
      // Liabilities = 20000
      // Equity = 40000 + 20000 = 60000
      // Liabilities + Equity = 80000
      // Note: Money.amount is stored in cents (x100)
      expect(result.summaries.totalAssets.amount).toBe(8000000);
      expect(result.summaries.totalLiabilities.amount).toBe(2000000);
      expect(result.summaries.totalEquity.amount).toBe(6000000);
      expect(result.summaries.totalLiabilitiesAndEquity.amount).toBe(8000000);
      expect(result.summaries.isBalanced).toBe(true);
      expect(result.summaries.difference.amount).toBe(0);
    });

    it('detects imbalanced balance sheet', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cash', '1000', 'Cash', 'ASSET', 'cash'),
        createAccount('capital', '3000', 'Share Capital', 'EQUITY', 'capital'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'cash', balance: 100000 },
        { accountId: 'capital', balance: 50000 }, // Intentionally imbalanced
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      expect(result.summaries.isBalanced).toBe(false);
      // 100000 - 50000 = 50000 (decimal), stored as 5000000 cents
      expect(result.summaries.difference.amount).toBe(5000000);
    });
  });

  // ============================================
  // Asset Classification Tests
  // ============================================

  describe('asset classification', () => {
    it('classifies current assets correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cash', '1000', 'Cash', 'ASSET', 'cash'),
        createAccount('bank', '1010', 'Bank Account', 'ASSET', 'bank'),
        createAccount('ar', '1200', 'Accounts Receivable', 'ASSET', 'receivable'),
        createAccount('inventory', '1300', 'Inventory', 'ASSET', 'inventory'),
        createAccount('prepaid', '1400', 'Prepaid Expenses', 'ASSET', 'prepaid'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'cash', balance: 20000 },
        { accountId: 'bank', balance: 50000 },
        { accountId: 'ar', balance: 30000 },
        { accountId: 'inventory', balance: 25000 },
        { accountId: 'prepaid', balance: 5000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const currentAssets = result.sections.assets.subsections.find(
        (s) => s.key === 'current_assets'
      );
      expect(currentAssets).toBeDefined();
      // 20000+50000+30000+25000+5000 = 130000 (decimal), stored as 13000000 cents
      expect(currentAssets!.subtotal.amount).toBe(13000000);
      expect(currentAssets!.items.length).toBe(5);
    });

    it('classifies fixed assets correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('equipment', '1500', 'Equipment', 'ASSET', 'equipment'),
        createAccount('building', '1510', 'Building', 'ASSET', 'building'),
        createAccount('vehicle', '1520', 'Vehicles', 'ASSET', 'vehicle'),
        createAccount('intangible', '1600', 'Patents', 'ASSET', 'intangible'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'equipment', balance: 50000 },
        { accountId: 'building', balance: 200000 },
        { accountId: 'vehicle', balance: 30000 },
        { accountId: 'intangible', balance: 20000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const fixedAssets = result.sections.assets.subsections.find((s) => s.key === 'fixed_assets');
      expect(fixedAssets).toBeDefined();
      // 50000+200000+30000+20000 = 300000 (decimal), stored as 30000000 cents
      expect(fixedAssets!.subtotal.amount).toBe(30000000);
    });
  });

  // ============================================
  // Liability Classification Tests
  // ============================================

  describe('liability classification', () => {
    it('classifies current liabilities correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('ap', '2000', 'Accounts Payable', 'LIABILITY', 'accounts_payable'),
        createAccount('accrued', '2100', 'Accrued Expenses', 'LIABILITY', 'accrued'),
        createAccount('wages', '2200', 'Wages Payable', 'LIABILITY', 'wages_payable'),
        createAccount('tax', '2300', 'Taxes Payable', 'LIABILITY', 'tax_payable'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'ap', balance: 25000 },
        { accountId: 'accrued', balance: 10000 },
        { accountId: 'wages', balance: 15000 },
        { accountId: 'tax', balance: 8000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const currentLiabilities = result.sections.liabilities.subsections.find(
        (s) => s.key === 'current_liabilities'
      );
      expect(currentLiabilities).toBeDefined();
      // 25000+10000+15000+8000 = 58000 (decimal), stored as 5800000 cents
      expect(currentLiabilities!.subtotal.amount).toBe(5800000);
    });

    it('classifies long-term liabilities correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('loan', '2500', 'Long-term Loan', 'LIABILITY', 'loan'),
        createAccount('mortgage', '2600', 'Mortgage', 'LIABILITY', 'mortgage'),
        createAccount('bonds', '2700', 'Corporate Bonds', 'LIABILITY', 'bonds'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'loan', balance: 100000 },
        { accountId: 'mortgage', balance: 250000 },
        { accountId: 'bonds', balance: 150000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const longTermLiabilities = result.sections.liabilities.subsections.find(
        (s) => s.key === 'long_term_liabilities'
      );
      expect(longTermLiabilities).toBeDefined();
      // 100000+250000+150000 = 500000 (decimal), stored as 50000000 cents
      expect(longTermLiabilities!.subtotal.amount).toBe(50000000);
    });
  });

  // ============================================
  // Equity Classification Tests
  // ============================================

  describe('equity classification', () => {
    it('classifies share capital correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('common', '3000', 'Common Stock', 'EQUITY', 'common_stock'),
        createAccount('preferred', '3010', 'Preferred Stock', 'EQUITY', 'preferred_stock'),
        createAccount('paidIn', '3020', 'Paid-in Capital', 'EQUITY', 'paid_in_capital'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'common', balance: 100000 },
        { accountId: 'preferred', balance: 50000 },
        { accountId: 'paidIn', balance: 25000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const shareCapital = result.sections.equity.subsections.find(
        (s) => s.key === 'share_capital'
      );
      expect(shareCapital).toBeDefined();
      // 100000+50000+25000 = 175000 (decimal), stored as 17500000 cents
      expect(shareCapital!.subtotal.amount).toBe(17500000);
    });

    it('classifies retained earnings correctly', async () => {
      const accounts: GLAccountData[] = [
        createAccount('re', '3100', 'Retained Earnings', 'EQUITY', 'retained_earnings'),
        createAccount('reserves', '3200', 'Reserves', 'EQUITY', 'reserves'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 're', balance: 75000 },
        { accountId: 'reserves', balance: 25000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      const retainedEarnings = result.sections.equity.subsections.find(
        (s) => s.key === 'retained_earnings'
      );
      expect(retainedEarnings).toBeDefined();
      // 75000+25000 = 100000 (decimal), stored as 10000000 cents
      expect(retainedEarnings!.subtotal.amount).toBe(10000000);
    });
  });

  // ============================================
  // Financial Ratios Tests
  // ============================================

  describe('financial ratios', () => {
    it('calculates Current Ratio = Current Assets / Current Liabilities', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cash', '1000', 'Cash', 'ASSET', 'cash'),
        createAccount('ap', '2000', 'Accounts Payable', 'LIABILITY', 'accounts_payable'),
        createAccount('capital', '3000', 'Capital', 'EQUITY', 'capital'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'cash', balance: 100000 }, // Current Assets
        { accountId: 'ap', balance: 50000 }, // Current Liabilities
        { accountId: 'capital', balance: 50000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Current Ratio = 100000 / 50000 = 2.0
      expect(result.ratios?.currentRatio).toBe(2);
    });

    it('calculates Working Capital = Current Assets - Current Liabilities', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cash', '1000', 'Cash', 'ASSET', 'cash'),
        createAccount('ar', '1200', 'AR', 'ASSET', 'receivable'),
        createAccount('ap', '2000', 'AP', 'LIABILITY', 'payable'),
        createAccount('capital', '3000', 'Capital', 'EQUITY', 'capital'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'cash', balance: 50000 },
        { accountId: 'ar', balance: 30000 },
        { accountId: 'ap', balance: 25000 },
        { accountId: 'capital', balance: 55000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Working Capital = (50000 + 30000) - 25000 = 55000 (decimal), stored as 5500000 cents
      expect(result.ratios?.workingCapital?.amount).toBe(5500000);
    });

    it('handles zero current liabilities for ratios', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cash', '1000', 'Cash', 'ASSET', 'cash'),
        createAccount('capital', '3000', 'Capital', 'EQUITY', 'capital'),
      ];

      const balances: AccountBalance[] = [
        { accountId: 'cash', balance: 100000 },
        { accountId: 'capital', balance: 100000 },
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue(balances);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // No current liabilities means no current ratio (avoid division by zero)
      expect(result.ratios?.currentRatio).toBeUndefined();
      // Working capital should still be calculated: 100000 (decimal) = 10000000 cents
      expect(result.ratios?.workingCapital?.amount).toBe(10000000);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('handles empty accounts list', async () => {
      mockRepository.getGLAccounts.mockResolvedValue([]);
      mockRepository.getGLAccountBalances.mockResolvedValue([]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      expect(result.summaries.totalAssets.amount).toBe(0);
      expect(result.summaries.totalLiabilities.amount).toBe(0);
      expect(result.summaries.totalEquity.amount).toBe(0);
      expect(result.summaries.isBalanced).toBe(true);
    });

    it('uses absolute values for display', async () => {
      const accounts: GLAccountData[] = [createAccount('cash', '1000', 'Cash', 'ASSET', 'cash')];

      // Assets typically have debit balances (positive)
      // but test with negative to ensure abs is used
      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue([
        { accountId: 'cash', balance: -50000 },
      ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // Should display positive: 50000 (decimal) = 5000000 cents
      const cashItem = result.sections.assets.subsections[0]?.items[0];
      expect(cashItem?.balance.amount).toBe(5000000);
    });

    it('includes report metadata', async () => {
      mockRepository.getGLAccounts.mockResolvedValue([]);
      mockRepository.getGLAccountBalances.mockResolvedValue([]);

      const result = await service.generate({
        workspaceId: 'ws-123',
        asOfDate: '2024-12-31',
        baseCurrency: 'EUR',
      });

      expect(result.metadata.workspaceId).toBe('ws-123');
      expect(result.metadata.baseCurrency).toBe('EUR');
      expect(result.metadata.period.start).toBe('2024-12-31');
      expect(result.metadata.period.end).toBe('2024-12-31');
      expect(result.metadata.generatedAt).toBeDefined();
    });

    it('handles account code-based classification fallback', async () => {
      // Account without explicit subType, should classify by code
      const accounts: GLAccountData[] = [
        createAccount('asset-10', '1000', 'Some Asset', 'ASSET'),
        createAccount('asset-15', '1500', 'Fixed Asset', 'ASSET'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances.mockResolvedValue([
        { accountId: 'asset-10', balance: 10000 },
        { accountId: 'asset-15', balance: 20000 },
      ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
      });

      // 1000 code should be current, 1500 should be fixed
      // 10000+20000 = 30000 (decimal) = 3000000 cents
      expect(result.sections.assets.total.amount).toBe(3000000);
    });
  });

  // ============================================
  // Comparative Balance Sheet Tests
  // ============================================

  describe('comparative periods', () => {
    it('includes previous period balances when comparative option is set', async () => {
      const accounts: GLAccountData[] = [
        createAccount('cash', '1000', 'Cash', 'ASSET', 'cash'),
        createAccount('capital', '3000', 'Capital', 'EQUITY', 'capital'),
      ];

      mockRepository.getGLAccounts.mockResolvedValue(accounts);
      mockRepository.getGLAccountBalances
        .mockResolvedValueOnce([
          { accountId: 'cash', balance: 120000 },
          { accountId: 'capital', balance: 120000 },
        ])
        .mockResolvedValueOnce([
          { accountId: 'cash', balance: 100000 },
          { accountId: 'capital', balance: 100000 },
        ]);

      const result = await service.generate({
        workspaceId: 'ws-1',
        asOfDate: '2024-12-31',
        baseCurrency: 'USD',
        options: { comparative: true },
        previousAsOfDate: '2023-12-31',
      });

      const cashItem = result.sections.assets.subsections[0]?.items[0];
      expect(cashItem?.previousBalance).toBeDefined();
      // Previous: 100000 (decimal) = 10000000 cents
      expect(cashItem?.previousBalance?.amount).toBe(10000000);
      // Change: 120000 - 100000 = 20000 (decimal) = 2000000 cents
      expect(cashItem?.change?.amount).toBe(2000000);
      expect(cashItem?.changePercentage).toBe(20);
    });
  });
});
