/**
 * Cash Flow Statement Service Tests
 *
 * Tests cash flow statement generation following accounting best practices:
 * - Fundamental equation: Beginning Cash + Net Change = Ending Cash
 * - Three-section classification: Operating, Investing, Financing
 * - Indirect method adjustments
 * - Sign conventions (inflows positive, outflows negative)
 * - Account classification accuracy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CashFlowService } from '../cash-flow-service';
import type { GLAccountData, JournalLineData, ReportRepository } from '../repository';

// Helper to create mock accounts with all required fields
const createMockAccount = (
  id: string,
  name: string,
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  subType?: string
): GLAccountData => ({
  id,
  accountName: name,
  accountCode: `${type.charAt(0)}${id}`,
  accountType: type,
  normalBalance: type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
  subType,
  isActive: true,
});

// Helper to create journal lines
const createJournalLine = (
  accountId: string,
  debit: number,
  credit: number,
  date: string = '2024-01-15'
): JournalLineData => ({
  entryId: `je-${Math.random().toString(36).slice(2)}`,
  entryNumber: `JE-${Math.random().toString(36).slice(2).toUpperCase()}`,
  entryDate: date,
  description: 'Test journal entry',
  accountId,
  debitAmount: debit,
  creditAmount: credit,
  status: 'POSTED',
});

// Create mock repository
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

describe('CashFlowService', () => {
  let service: CashFlowService;
  let mockRepo: ReportRepository;

  const defaultInput = {
    workspaceId: 'ws-123',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    baseCurrency: 'USD' as const,
  };

  beforeEach(() => {
    mockRepo = createMockRepository();
    service = new CashFlowService(mockRepo);
  });

  describe('Fundamental Cash Flow Equation', () => {
    it('should satisfy: Beginning Cash + Net Change = Ending Cash', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
        createMockAccount('3', 'Sales Revenue', 'REVENUE'),
      ];

      const journalLines: JournalLineData[] = [
        // Customer payment (reduces AR, increases cash in reality)
        createJournalLine('2', 0, 5000), // AR decreases (credit)
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance)
        .mockResolvedValueOnce(10000) // Beginning cash
        .mockResolvedValueOnce(15000); // Ending cash

      const result = await service.generate(defaultInput);

      // Net change = Ending - Beginning = 15000 - 10000 = 5000
      // Note: Money.amount is stored in cents (x100)
      expect(result.summaries.beginningCash.amount).toBe(1000000); // 10000 decimal = 1000000 cents
      expect(result.summaries.endingCash.amount).toBe(1500000); // 15000 decimal = 1500000 cents

      // AR decrease of 5000 is a SOURCE of cash (customers paid) = POSITIVE in indirect method
      expect(result.summaries.netChangeInCash.amount).toBe(500000); // 5000 decimal = 500000 cents

      // Total of all sections should equal net change
      const sectionTotal =
        result.summaries.netCashFromOperating.amount +
        result.summaries.netCashFromInvesting.amount +
        result.summaries.netCashFromFinancing.amount;
      expect(sectionTotal).toBe(result.summaries.netChangeInCash.amount);
    });

    it('should handle zero net change in cash', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue([]);
      vi.mocked(mockRepo.getCashAccountsBalance)
        .mockResolvedValueOnce(25000) // Beginning cash
        .mockResolvedValueOnce(25000); // Ending cash (same)

      const result = await service.generate(defaultInput);

      expect(result.summaries.netChangeInCash.amount).toBe(0);
      expect(result.summaries.beginningCash.amount).toBe(result.summaries.endingCash.amount);
    });
  });

  describe('Operating Activities Classification', () => {
    it('should classify accounts receivable changes as operating', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 3000), // AR decreases (credit) - collected cash
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      // AR decrease should be in operating section
      expect(result.sections.operating.items.length).toBeGreaterThan(0);
      const arItem = result.sections.operating.items.find((i) =>
        i.description.toLowerCase().includes('receivable')
      );
      expect(arItem).toBeDefined();
    });

    it('should classify accounts payable changes as operating', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Payable', 'LIABILITY'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 2000), // AP increases (credit) - deferred payment
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      expect(result.sections.operating.items.length).toBeGreaterThan(0);
      const apItem = result.sections.operating.items.find((i) =>
        i.description.toLowerCase().includes('payable')
      );
      expect(apItem).toBeDefined();
    });

    it('should classify inventory changes as operating', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Inventory', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 5000, 0), // Inventory increases (debit) - purchased more
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      const inventoryItem = result.sections.operating.items.find((i) =>
        i.description.toLowerCase().includes('inventory')
      );
      expect(inventoryItem).toBeDefined();
    });

    it('should classify depreciation as operating (non-cash adjustment)', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accumulated Depreciation', 'ASSET', 'depreciation'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 1500), // Depreciation recorded
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      // Depreciation is a non-cash item, should be in operating
      const depItem = result.sections.operating.items.find(
        (i) =>
          i.description.toLowerCase().includes('depreciation') ||
          i.description.toLowerCase().includes('accumulated')
      );
      expect(depItem).toBeDefined();
    });
  });

  describe('Investing Activities Classification', () => {
    it('should classify equipment purchases as investing', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Equipment', 'ASSET', 'fixed_asset'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 15000, 0), // Equipment purchased
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(50000);

      const result = await service.generate(defaultInput);

      expect(result.sections.investing.items.length).toBeGreaterThan(0);
      const equipItem = result.sections.investing.items.find((i) =>
        i.description.toLowerCase().includes('equipment')
      );
      expect(equipItem).toBeDefined();
    });

    it('should classify property purchases as investing', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Property', 'ASSET', 'property'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 100000, 0), // Property purchased
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(200000);

      const result = await service.generate(defaultInput);

      const propertyItem = result.sections.investing.items.find((i) =>
        i.description.toLowerCase().includes('property')
      );
      expect(propertyItem).toBeDefined();
      // Purchase should show as outflow (NEGATIVE - cash went out)
      // -100000 decimal = -10000000 cents
      expect(propertyItem!.amount.amount).toBe(-10000000);
    });

    it('should classify investment securities as investing', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Investment Securities', 'ASSET', 'investment'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 25000, 0), // Securities purchased
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(100000);

      const result = await service.generate(defaultInput);

      expect(result.sections.investing.items.some((i) => i.amount.amount !== 0)).toBe(true);
    });

    it('should classify asset sales as investing inflows', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Equipment', 'ASSET', 'fixed_asset'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 8000), // Equipment sold (credit decreases asset)
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(50000);

      const result = await service.generate(defaultInput);

      // Sale should show in investing as INFLOW (credit to asset = cash received)
      expect(result.sections.investing.items.length).toBeGreaterThan(0);
      // 8000 decimal = 800000 cents (POSITIVE - cash inflow from sale)
      expect(result.sections.investing.netCashFlow.amount).toBe(800000);
    });
  });

  describe('Financing Activities Classification', () => {
    it('should classify loan proceeds as financing inflows', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Term Loan', 'LIABILITY', 'loan'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 50000), // Loan received (credit increases liability)
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(100000);

      const result = await service.generate(defaultInput);

      // Loan credit shows as financing INFLOW (received cash from loan)
      expect(result.sections.financing.items.length).toBeGreaterThan(0);
      // 50000 (credit > debit) = 5000000 cents (POSITIVE - cash inflow)
      expect(result.sections.financing.netCashFlow.amount).toBe(5000000);
    });

    it('should classify loan repayments as financing outflows', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Term Loan', 'LIABILITY', 'loan'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 10000, 0), // Loan repaid (debit decreases liability)
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(100000);

      const result = await service.generate(defaultInput);

      // Loan debit shows as financing OUTFLOW (used cash to repay loan)
      expect(result.sections.financing.items.length).toBeGreaterThan(0);
      // -10000 (debit > credit) = -1000000 cents (NEGATIVE - cash outflow)
      expect(result.sections.financing.netCashFlow.amount).toBe(-1000000);
    });

    it('should classify dividend payments as financing outflows', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Dividends Payable', 'LIABILITY', 'dividend'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 5000, 0), // Dividends paid
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(100000);

      const result = await service.generate(defaultInput);

      const dividendItem = result.sections.financing.items.find((i) =>
        i.description.toLowerCase().includes('dividend')
      );
      expect(dividendItem).toBeDefined();
    });

    it('should classify equity issuance as financing inflows', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Common Stock', 'EQUITY', 'capital'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 100000), // Stock issued
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(200000);

      const result = await service.generate(defaultInput);

      // Stock issuance shows as financing INFLOW (received cash from investors)
      expect(result.sections.financing.items.length).toBeGreaterThan(0);
      // 100000 (credit) = 10000000 cents (POSITIVE - cash inflow)
      expect(result.sections.financing.netCashFlow.amount).toBe(10000000);
    });

    it('should classify share repurchases as financing outflows', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Treasury Stock', 'EQUITY', 'treasury'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 20000, 0), // Treasury stock purchased (buyback)
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(200000);

      const result = await service.generate(defaultInput);

      // Treasury stock increases with debit, represents cash outflow
      expect(result.sections.financing.items.length).toBeGreaterThan(0);
    });
  });

  describe('Cash Account Exclusion', () => {
    it('should exclude cash accounts from line items', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash on Hand', 'ASSET', 'cash'),
        createMockAccount('2', 'Bank Account', 'ASSET', 'bank'),
        createMockAccount('3', 'Checking Account', 'ASSET', 'checking'),
        createMockAccount('4', 'Accounts Receivable', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('1', 5000, 0), // Cash increase
        createJournalLine('2', 3000, 0), // Bank increase
        createJournalLine('3', 2000, 0), // Checking increase
        createJournalLine('4', 0, 10000), // AR decrease
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(50000);

      const result = await service.generate(defaultInput);

      // Cash accounts should not appear as line items
      const allItems = [
        ...result.sections.operating.items,
        ...result.sections.investing.items,
        ...result.sections.financing.items,
      ];

      const cashItems = allItems.filter(
        (i) =>
          i.description.toLowerCase().includes('cash on hand') ||
          i.description.toLowerCase().includes('bank account') ||
          i.description.toLowerCase().includes('checking account')
      );

      expect(cashItems.length).toBe(0);
    });

    it('should include petty cash accounts in exclusion', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Petty Cash', 'ASSET', 'petty_cash'),
        createMockAccount('2', 'Office Supplies', 'EXPENSE'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('1', 0, 100), // Petty cash decrease
        createJournalLine('2', 100, 0), // Expense increase
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(500);

      const result = await service.generate(defaultInput);

      const allItems = [
        ...result.sections.operating.items,
        ...result.sections.investing.items,
        ...result.sections.financing.items,
      ];

      const pettyCashItems = allItems.filter((i) =>
        i.description.toLowerCase().includes('petty cash')
      );
      expect(pettyCashItems.length).toBe(0);
    });
  });

  describe('Section Totals and Net Cash Flow', () => {
    it('should calculate correct net cash from operating activities', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
        createMockAccount('3', 'Accounts Payable', 'LIABILITY'),
        createMockAccount('4', 'Inventory', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 5000), // AR decrease (inflow adjustment)
        createJournalLine('3', 0, 3000), // AP increase (inflow adjustment)
        createJournalLine('4', 2000, 0), // Inventory increase (outflow adjustment)
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(50000);

      const result = await service.generate(defaultInput);

      // Sum of items should equal section netCashFlow
      const itemsTotal = result.sections.operating.items.reduce(
        (sum, item) => sum + item.amount.amount,
        0
      );
      expect(result.sections.operating.netCashFlow.amount).toBe(itemsTotal);
    });

    it('should calculate correct net cash from investing activities', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Equipment', 'ASSET', 'fixed_asset'),
        createMockAccount('3', 'Investments', 'ASSET', 'investment'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 30000, 0), // Equipment purchased
        createJournalLine('3', 0, 10000), // Investment sold
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(100000);

      const result = await service.generate(defaultInput);

      const itemsTotal = result.sections.investing.items.reduce(
        (sum, item) => sum + item.amount.amount,
        0
      );
      expect(result.sections.investing.netCashFlow.amount).toBe(itemsTotal);
    });

    it('should calculate correct net cash from financing activities', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Term Loan', 'LIABILITY', 'loan'),
        createMockAccount('3', 'Common Stock', 'EQUITY', 'capital'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 50000), // Loan received
        createJournalLine('3', 0, 25000), // Stock issued
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(200000);

      const result = await service.generate(defaultInput);

      const itemsTotal = result.sections.financing.items.reduce(
        (sum, item) => sum + item.amount.amount,
        0
      );
      expect(result.sections.financing.netCashFlow.amount).toBe(itemsTotal);
    });

    it('should sum all sections to equal net change in cash', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
        createMockAccount('3', 'Equipment', 'ASSET', 'fixed_asset'),
        createMockAccount('4', 'Term Loan', 'LIABILITY', 'loan'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 5000), // Operating
        createJournalLine('3', 10000, 0), // Investing
        createJournalLine('4', 0, 20000), // Financing
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(100000);

      const result = await service.generate(defaultInput);

      const totalFromSections =
        result.summaries.netCashFromOperating.amount +
        result.summaries.netCashFromInvesting.amount +
        result.summaries.netCashFromFinancing.amount;

      expect(result.summaries.netChangeInCash.amount).toBe(totalFromSections);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty journal lines', async () => {
      const accounts: GLAccountData[] = [createMockAccount('1', 'Cash', 'ASSET', 'cash')];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue([]);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      expect(result.sections.operating.items).toHaveLength(0);
      expect(result.sections.investing.items).toHaveLength(0);
      expect(result.sections.financing.items).toHaveLength(0);
      expect(result.summaries.netChangeInCash.amount).toBe(0);
    });

    it('should handle journal lines with unknown account IDs', async () => {
      const accounts: GLAccountData[] = [createMockAccount('1', 'Cash', 'ASSET', 'cash')];

      const journalLines: JournalLineData[] = [
        createJournalLine('unknown-account', 1000, 0),
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      // Unknown accounts should be skipped
      expect(result.sections.operating.items).toHaveLength(0);
      expect(result.sections.investing.items).toHaveLength(0);
      expect(result.sections.financing.items).toHaveLength(0);
    });

    it('should filter out zero-amount items', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 100, 100), // Net zero
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      // Zero net items should be filtered out
      expect(result.sections.operating.items).toHaveLength(0);
    });

    it('should handle very small amounts (precision threshold)', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0.005, 0), // Below 0.01 threshold
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      // Amount below threshold should be filtered
      expect(result.sections.operating.items).toHaveLength(0);
    });

    it('should handle negative beginning cash balance', async () => {
      const accounts: GLAccountData[] = [createMockAccount('1', 'Cash', 'ASSET', 'cash')];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue([]);
      vi.mocked(mockRepo.getCashAccountsBalance)
        .mockResolvedValueOnce(-5000) // Overdraft
        .mockResolvedValueOnce(10000);

      const result = await service.generate(defaultInput);

      // -5000 decimal = -500000 cents
      expect(result.summaries.beginningCash.amount).toBe(-500000);
      // 10000 decimal = 1000000 cents
      expect(result.summaries.endingCash.amount).toBe(1000000);
    });
  });

  describe('Metadata', () => {
    it('should include correct report metadata', async () => {
      const accounts: GLAccountData[] = [createMockAccount('1', 'Cash', 'ASSET', 'cash')];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue([]);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      expect(result.metadata.workspaceId).toBe(defaultInput.workspaceId);
      expect(result.metadata.baseCurrency).toBe(defaultInput.baseCurrency);
      expect(result.metadata.period.start).toBe(defaultInput.startDate);
      expect(result.metadata.period.end).toBe(defaultInput.endDate);
      expect(result.metadata.generatedAt).toBeDefined();
    });

    it('should include section names and keys', async () => {
      const accounts: GLAccountData[] = [createMockAccount('1', 'Cash', 'ASSET', 'cash')];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue([]);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      expect(result.sections.operating.name).toBe('Cash Flows from Operating Activities');
      expect(result.sections.operating.key).toBe('operating');
      expect(result.sections.investing.name).toBe('Cash Flows from Investing Activities');
      expect(result.sections.investing.key).toBe('investing');
      expect(result.sections.financing.name).toBe('Cash Flows from Financing Activities');
      expect(result.sections.financing.key).toBe('financing');
    });
  });

  describe('Currency Handling', () => {
    it('should use specified base currency for all money values', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [createJournalLine('2', 0, 5000)];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate({ ...defaultInput, baseCurrency: 'EUR' });

      expect(result.summaries.beginningCash.currency).toBe('EUR');
      expect(result.summaries.endingCash.currency).toBe('EUR');
      expect(result.summaries.netChangeInCash.currency).toBe('EUR');
      expect(result.sections.operating.netCashFlow.currency).toBe('EUR');
    });
  });

  describe('Aggregation by Account', () => {
    it('should aggregate multiple entries for the same account', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Accounts Receivable', 'ASSET'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 0, 1000, '2024-01-05'),
        createJournalLine('2', 0, 2000, '2024-01-10'),
        createJournalLine('2', 0, 3000, '2024-01-15'),
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(10000);

      const result = await service.generate(defaultInput);

      // Should aggregate to single line item with total 6000 (decimal)
      // AR decrease = cash INFLOW (customers paid us)
      const arItems = result.sections.operating.items.filter((i) =>
        i.description.toLowerCase().includes('receivable')
      );
      expect(arItems).toHaveLength(1);
      // 6000 decimal = 600000 cents (POSITIVE - cash inflow from collections)
      expect(arItems[0].amount.amount).toBe(600000);
    });
  });

  describe('Line Item Sorting', () => {
    it('should sort items by absolute amount descending', async () => {
      const accounts: GLAccountData[] = [
        createMockAccount('1', 'Cash', 'ASSET', 'cash'),
        createMockAccount('2', 'Small Expense', 'EXPENSE'),
        createMockAccount('3', 'Large Expense', 'EXPENSE'),
        createMockAccount('4', 'Medium Expense', 'EXPENSE'),
      ];

      const journalLines: JournalLineData[] = [
        createJournalLine('2', 100, 0),
        createJournalLine('3', 10000, 0),
        createJournalLine('4', 1000, 0),
      ];

      vi.mocked(mockRepo.getGLAccounts).mockResolvedValue(accounts);
      vi.mocked(mockRepo.getJournalLines).mockResolvedValue(journalLines);
      vi.mocked(mockRepo.getCashAccountsBalance).mockResolvedValue(50000);

      const result = await service.generate(defaultInput);

      const amounts = result.sections.operating.items.map((i) => Math.abs(i.amount.amount));
      const sortedAmounts = [...amounts].sort((a, b) => b - a);
      expect(amounts).toEqual(sortedAmounts);
    });
  });
});
