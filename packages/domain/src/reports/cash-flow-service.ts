/**
 * Cash Flow Statement Service
 *
 * Generates Cash Flow Statement using the indirect method.
 * Classifies activities into Operating, Investing, and Financing.
 */

import type { CurrencyCode, Money, UUID } from '@moneio/core-ledger';
import { createMoney } from '@moneio/core-ledger';

import type { ReportRepository, GLAccountData, JournalLineData } from './repository';
import type {
  CashFlowStatement,
  CashFlowSection,
  CashFlowLineItem,
  CashFlowInput,
  ReportMetadata,
} from './types';

/**
 * Account subtypes for cash flow classification
 */
const INVESTING_ACCOUNT_PATTERNS = [
  'fixed_asset',
  'property',
  'plant',
  'equipment',
  'ppe',
  'investment',
  'securities',
  'intangible',
  'acquisition',
];

const FINANCING_ACCOUNT_PATTERNS = [
  'loan',
  'debt',
  'mortgage',
  'bonds',
  'capital',
  'stock',
  'dividend',
  'equity',
  'share',
  'treasury',
];

const CASH_ACCOUNT_PATTERNS = ['cash', 'bank', 'checking', 'savings', 'petty_cash'];

export class CashFlowService {
  constructor(private readonly repository: ReportRepository) {}

  async generate(input: CashFlowInput): Promise<CashFlowStatement> {
    const { workspaceId, startDate, endDate, baseCurrency } = input;

    // Fetch data
    const [accounts, journalLines, beginningCash, endingCash] = await Promise.all([
      this.repository.getGLAccounts(workspaceId),
      this.repository.getJournalLines(workspaceId, startDate, endDate),
      this.repository.getCashAccountsBalance(workspaceId, this.getPreviousDay(startDate)),
      this.repository.getCashAccountsBalance(workspaceId, endDate),
    ]);

    // Build account lookup
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    // Classify and aggregate journal entries
    const cashFlowItems = this.classifyJournalLines(journalLines, accountMap);

    // Build sections
    const operatingSection = this.buildOperatingSection(cashFlowItems.operating, baseCurrency);
    const investingSection = this.buildInvestingSection(cashFlowItems.investing, baseCurrency);
    const financingSection = this.buildFinancingSection(cashFlowItems.financing, baseCurrency);

    // Calculate net change
    const netCashFromOperating = operatingSection.netCashFlow;
    const netCashFromInvesting = investingSection.netCashFlow;
    const netCashFromFinancing = financingSection.netCashFlow;
    // Don't use createMoney - amounts are already in minor units (cents)
    const netChangeInCash: Money = {
      amount:
        netCashFromOperating.amount + netCashFromInvesting.amount + netCashFromFinancing.amount,
      currency: baseCurrency,
      decimalPlaces: 2,
    };

    const metadata: ReportMetadata = {
      generatedAt: new Date().toISOString(),
      workspaceId,
      baseCurrency,
      period: { start: startDate, end: endDate },
    };

    return {
      metadata,
      sections: {
        operating: operatingSection,
        investing: investingSection,
        financing: financingSection,
      },
      summaries: {
        netCashFromOperating,
        netCashFromInvesting,
        netCashFromFinancing,
        netChangeInCash,
        beginningCash: createMoney(beginningCash, baseCurrency),
        endingCash: createMoney(endingCash, baseCurrency),
      },
    };
  }

  private getPreviousDay(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  private classifyJournalLines(
    lines: JournalLineData[],
    accountMap: Map<UUID, GLAccountData>
  ): {
    operating: Map<string, number>;
    investing: Map<string, number>;
    financing: Map<string, number>;
  } {
    const operating = new Map<string, number>();
    const investing = new Map<string, number>();
    const financing = new Map<string, number>();

    for (const line of lines) {
      const account = accountMap.get(line.accountId);
      if (!account) continue;

      // Skip cash accounts - their change is the result, not a line item
      if (this.isCashAccount(account)) continue;

      // For indirect method: credit increases cash effect, debit decreases it
      // - Decrease in assets (credit > debit) = source of cash (positive)
      // - Increase in assets (debit > credit) = use of cash (negative)
      // - Increase in liabilities (credit > debit) = source of cash (positive)
      // - Decrease in liabilities (debit > credit) = use of cash (negative)
      const netAmount = line.creditAmount - line.debitAmount;
      const classification = this.classifyAccount(account);
      const description = this.getLineDescription(account);

      const targetMap =
        classification === 'operating'
          ? operating
          : classification === 'investing'
            ? investing
            : financing;

      const existing = targetMap.get(description) || 0;
      targetMap.set(description, existing + netAmount);
    }

    return { operating, investing, financing };
  }

  private classifyAccount(account: GLAccountData): 'operating' | 'investing' | 'financing' {
    const subType = account.subType?.toLowerCase() || '';
    const name = account.accountName.toLowerCase();
    const combined = `${subType} ${name}`;

    // Check investing first (fixed assets, investments)
    if (INVESTING_ACCOUNT_PATTERNS.some((p) => combined.includes(p))) {
      return 'investing';
    }

    // Check financing (loans, equity)
    if (FINANCING_ACCOUNT_PATTERNS.some((p) => combined.includes(p))) {
      return 'financing';
    }

    // Default to operating
    return 'operating';
  }

  private isCashAccount(account: GLAccountData): boolean {
    const subType = account.subType?.toLowerCase() || '';
    const name = account.accountName.toLowerCase();
    const combined = `${subType} ${name}`;

    return CASH_ACCOUNT_PATTERNS.some((p) => combined.includes(p));
  }

  private getLineDescription(account: GLAccountData): string {
    // Group by account for cleaner presentation
    return account.accountName;
  }

  private buildOperatingSection(
    items: Map<string, number>,
    baseCurrency: CurrencyCode
  ): CashFlowSection {
    const lineItems: CashFlowLineItem[] = [];

    // Add adjustments for non-cash items
    for (const [description, amount] of items) {
      if (Math.abs(amount) > 0.01) {
        lineItems.push({
          description: this.formatOperatingDescription(description, amount),
          amount: createMoney(amount, baseCurrency),
          isSubtotal: false,
        });
      }
    }

    // Sort by absolute amount (largest first)
    lineItems.sort((a, b) => Math.abs(b.amount.amount) - Math.abs(a.amount.amount));

    // Don't use createMoney - amounts are already in minor units
    const netCashFlow: Money = {
      amount: lineItems.reduce((sum, item) => sum + item.amount.amount, 0),
      currency: baseCurrency,
      decimalPlaces: 2,
    };

    return {
      name: 'Cash Flows from Operating Activities',
      key: 'operating',
      items: lineItems,
      netCashFlow,
    };
  }

  private buildInvestingSection(
    items: Map<string, number>,
    baseCurrency: CurrencyCode
  ): CashFlowSection {
    const lineItems: CashFlowLineItem[] = [];

    for (const [description, amount] of items) {
      if (Math.abs(amount) > 0.01) {
        lineItems.push({
          description: this.formatInvestingDescription(description, amount),
          amount: createMoney(amount, baseCurrency),
          isSubtotal: false,
        });
      }
    }

    lineItems.sort((a, b) => Math.abs(b.amount.amount) - Math.abs(a.amount.amount));

    // Don't use createMoney - amounts are already in minor units
    const netCashFlow: Money = {
      amount: lineItems.reduce((sum, item) => sum + item.amount.amount, 0),
      currency: baseCurrency,
      decimalPlaces: 2,
    };

    return {
      name: 'Cash Flows from Investing Activities',
      key: 'investing',
      items: lineItems,
      netCashFlow,
    };
  }

  private buildFinancingSection(
    items: Map<string, number>,
    baseCurrency: CurrencyCode
  ): CashFlowSection {
    const lineItems: CashFlowLineItem[] = [];

    for (const [description, amount] of items) {
      if (Math.abs(amount) > 0.01) {
        lineItems.push({
          description: this.formatFinancingDescription(description, amount),
          amount: createMoney(amount, baseCurrency),
          isSubtotal: false,
        });
      }
    }

    lineItems.sort((a, b) => Math.abs(b.amount.amount) - Math.abs(a.amount.amount));

    // Don't use createMoney - amounts are already in minor units
    const netCashFlow: Money = {
      amount: lineItems.reduce((sum, item) => sum + item.amount.amount, 0),
      currency: baseCurrency,
      decimalPlaces: 2,
    };

    return {
      name: 'Cash Flows from Financing Activities',
      key: 'financing',
      items: lineItems,
      netCashFlow,
    };
  }

  private formatOperatingDescription(accountName: string, amount: number): string {
    const prefix = amount > 0 ? 'Increase' : 'Decrease';
    if (accountName.toLowerCase().includes('receivable')) {
      return `${prefix} in Accounts Receivable`;
    }
    if (accountName.toLowerCase().includes('payable')) {
      return `${prefix} in Accounts Payable`;
    }
    if (accountName.toLowerCase().includes('inventory')) {
      return `${prefix} in Inventory`;
    }
    if (accountName.toLowerCase().includes('depreciation')) {
      return 'Depreciation & Amortization';
    }
    return accountName;
  }

  private formatInvestingDescription(accountName: string, amount: number): string {
    if (amount < 0) {
      return `Purchase of ${accountName}`;
    }
    return `Sale of ${accountName}`;
  }

  private formatFinancingDescription(accountName: string, amount: number): string {
    if (accountName.toLowerCase().includes('dividend')) {
      return 'Dividends Paid';
    }
    if (accountName.toLowerCase().includes('loan') || accountName.toLowerCase().includes('debt')) {
      return amount > 0 ? 'Proceeds from Borrowings' : 'Repayment of Borrowings';
    }
    if (
      accountName.toLowerCase().includes('capital') ||
      accountName.toLowerCase().includes('stock')
    ) {
      return amount > 0 ? 'Proceeds from Equity' : 'Share Repurchase';
    }
    return accountName;
  }
}
