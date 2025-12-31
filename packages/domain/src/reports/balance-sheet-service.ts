/**
 * Balance Sheet Service
 *
 * Generates Balance Sheet (Statement of Financial Position) reports.
 * Assets = Liabilities + Equity
 */

import type { CurrencyCode, Money, UUID } from '@moneio/core-ledger';
import { createMoney } from '@moneio/core-ledger';

import { buildAccountTree, flattenTree } from './repository';
import type { ReportRepository, AccountTreeNode, GLAccountData } from './repository';
import type {
  BalanceSheet,
  BalanceSheetSection,
  BalanceSheetSubsection,
  BalanceSheetLineItem,
  BalanceSheetRatios,
  BalanceSheetInput,
  ReportMetadata,
} from './types';

/**
 * Asset subtypes for classification
 */
const CURRENT_ASSET_SUBTYPES = [
  'cash', 'bank', 'checking', 'savings',
  'accounts_receivable', 'receivable', 'ar',
  'inventory', 'prepaid', 'short_term',
];

const FIXED_ASSET_SUBTYPES = [
  'fixed_asset', 'property', 'plant', 'equipment', 'ppe',
  'vehicle', 'furniture', 'machinery', 'building', 'land',
  'intangible', 'goodwill', 'patent', 'trademark',
];

/**
 * Liability subtypes for classification
 */
const CURRENT_LIABILITY_SUBTYPES = [
  'accounts_payable', 'payable', 'ap',
  'accrued', 'short_term_debt', 'current_portion',
  'tax_payable', 'vat_payable', 'wages_payable',
  'unearned_revenue', 'deferred_revenue',
];

const LONG_TERM_LIABILITY_SUBTYPES = [
  'long_term_debt', 'loan', 'mortgage', 'bonds',
  'deferred_tax', 'pension', 'lease_liability',
];

/**
 * Equity subtypes for classification
 */
const CAPITAL_SUBTYPES = ['capital', 'common_stock', 'preferred_stock', 'paid_in_capital', 'share_capital'];
const RETAINED_EARNINGS_SUBTYPES = ['retained_earnings', 'accumulated_profit', 'reserves'];

export class BalanceSheetService {
  constructor(private readonly repository: ReportRepository) {}

  async generate(input: BalanceSheetInput): Promise<BalanceSheet> {
    const { workspaceId, asOfDate, baseCurrency, options, previousAsOfDate } = input;

    // Fetch data
    const [accounts, currentBalances] = await Promise.all([
      this.repository.getGLAccounts(workspaceId),
      this.repository.getGLAccountBalances(workspaceId, asOfDate),
    ]);

    // Fetch previous period if comparative
    let previousBalances: Map<UUID, number> | undefined;
    if (previousAsOfDate && options?.comparative) {
      const prevBalanceData = await this.repository.getGLAccountBalances(
        workspaceId,
        previousAsOfDate
      );
      previousBalances = new Map(prevBalanceData.map((b) => [b.accountId, b.balance]));
    }

    // Create balance map
    const balanceMap = new Map(currentBalances.map((b) => [b.accountId, b.balance]));

    // Filter by type and build sections
    const assetAccounts = accounts.filter((a) => a.accountType === 'ASSET');
    const liabilityAccounts = accounts.filter((a) => a.accountType === 'LIABILITY');
    const equityAccounts = accounts.filter((a) => a.accountType === 'EQUITY');

    // Build trees
    const assetTree = buildAccountTree(assetAccounts, balanceMap, previousBalances);
    const liabilityTree = buildAccountTree(liabilityAccounts, balanceMap, previousBalances);
    const equityTree = buildAccountTree(equityAccounts, balanceMap, previousBalances);

    // Build sections with subsections
    const assetsSection = this.buildAssetSection(assetTree, baseCurrency);
    const liabilitiesSection = this.buildLiabilitySection(liabilityTree, baseCurrency);
    const equitySection = this.buildEquitySection(equityTree, baseCurrency);

    // Calculate totals
    const totalAssets = this.sumSection(assetsSection, baseCurrency);
    const totalLiabilities = this.sumSection(liabilitiesSection, baseCurrency);
    const totalEquity = this.sumSection(equitySection, baseCurrency);
    const totalLiabilitiesAndEquity = createMoney(
      totalLiabilities.amount + totalEquity.amount,
      baseCurrency
    );
    const difference = createMoney(
      totalAssets.amount - totalLiabilitiesAndEquity.amount,
      baseCurrency
    );
    const isBalanced = Math.abs(difference.amount) < 0.01;

    // Calculate ratios
    const ratios = this.calculateRatios(assetsSection, liabilitiesSection, baseCurrency);

    const metadata: ReportMetadata = {
      generatedAt: new Date().toISOString(),
      workspaceId,
      baseCurrency,
      period: { start: asOfDate, end: asOfDate },
    };

    return {
      metadata,
      sections: {
        assets: assetsSection,
        liabilities: liabilitiesSection,
        equity: equitySection,
      },
      summaries: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalLiabilitiesAndEquity,
        isBalanced,
        difference,
      },
      ratios,
    };
  }

  private buildAssetSection(
    tree: AccountTreeNode[],
    baseCurrency: CurrencyCode
  ): BalanceSheetSection {
    const currentAssets: AccountTreeNode[] = [];
    const fixedAssets: AccountTreeNode[] = [];
    const otherAssets: AccountTreeNode[] = [];

    for (const node of tree) {
      const classification = this.classifyAsset(node.account);
      if (classification === 'current') {
        currentAssets.push(node);
      } else if (classification === 'fixed') {
        fixedAssets.push(node);
      } else {
        otherAssets.push(node);
      }
    }

    const subsections: BalanceSheetSubsection[] = [];

    if (currentAssets.length > 0) {
      subsections.push(this.buildSubsection('Current Assets', 'current_assets', currentAssets, baseCurrency));
    }
    if (fixedAssets.length > 0) {
      subsections.push(this.buildSubsection('Fixed Assets', 'fixed_assets', fixedAssets, baseCurrency));
    }
    if (otherAssets.length > 0) {
      subsections.push(this.buildSubsection('Other Assets', 'other_assets', otherAssets, baseCurrency));
    }

    const total = createMoney(
      subsections.reduce((sum, sub) => sum + sub.subtotal.amount, 0),
      baseCurrency
    );

    return {
      name: 'Assets',
      key: 'assets',
      subsections,
      total,
    };
  }

  private buildLiabilitySection(
    tree: AccountTreeNode[],
    baseCurrency: CurrencyCode
  ): BalanceSheetSection {
    const currentLiabilities: AccountTreeNode[] = [];
    const longTermLiabilities: AccountTreeNode[] = [];
    const otherLiabilities: AccountTreeNode[] = [];

    for (const node of tree) {
      const classification = this.classifyLiability(node.account);
      if (classification === 'current') {
        currentLiabilities.push(node);
      } else if (classification === 'long_term') {
        longTermLiabilities.push(node);
      } else {
        otherLiabilities.push(node);
      }
    }

    const subsections: BalanceSheetSubsection[] = [];

    if (currentLiabilities.length > 0) {
      subsections.push(this.buildSubsection('Current Liabilities', 'current_liabilities', currentLiabilities, baseCurrency));
    }
    if (longTermLiabilities.length > 0) {
      subsections.push(this.buildSubsection('Long-Term Liabilities', 'long_term_liabilities', longTermLiabilities, baseCurrency));
    }
    if (otherLiabilities.length > 0) {
      subsections.push(this.buildSubsection('Other Liabilities', 'other_liabilities', otherLiabilities, baseCurrency));
    }

    const total = createMoney(
      subsections.reduce((sum, sub) => sum + sub.subtotal.amount, 0),
      baseCurrency
    );

    return {
      name: 'Liabilities',
      key: 'liabilities',
      subsections,
      total,
    };
  }

  private buildEquitySection(
    tree: AccountTreeNode[],
    baseCurrency: CurrencyCode
  ): BalanceSheetSection {
    const capital: AccountTreeNode[] = [];
    const retainedEarnings: AccountTreeNode[] = [];
    const otherEquity: AccountTreeNode[] = [];

    for (const node of tree) {
      const classification = this.classifyEquity(node.account);
      if (classification === 'capital') {
        capital.push(node);
      } else if (classification === 'retained') {
        retainedEarnings.push(node);
      } else {
        otherEquity.push(node);
      }
    }

    const subsections: BalanceSheetSubsection[] = [];

    if (capital.length > 0) {
      subsections.push(this.buildSubsection('Share Capital', 'share_capital', capital, baseCurrency));
    }
    if (retainedEarnings.length > 0) {
      subsections.push(this.buildSubsection('Retained Earnings', 'retained_earnings', retainedEarnings, baseCurrency));
    }
    if (otherEquity.length > 0) {
      subsections.push(this.buildSubsection('Other Equity', 'other_equity', otherEquity, baseCurrency));
    }

    const total = createMoney(
      subsections.reduce((sum, sub) => sum + sub.subtotal.amount, 0),
      baseCurrency
    );

    return {
      name: 'Equity',
      key: 'equity',
      subsections,
      total,
    };
  }

  private buildSubsection(
    name: string,
    key: string,
    nodes: AccountTreeNode[],
    baseCurrency: CurrencyCode
  ): BalanceSheetSubsection {
    const items = this.flattenToLineItems(nodes, baseCurrency);
    const subtotal = createMoney(
      nodes.reduce((sum, node) => sum + Math.abs(node.balance), 0),
      baseCurrency
    );

    return {
      name,
      key,
      items,
      subtotal,
    };
  }

  private flattenToLineItems(
    nodes: AccountTreeNode[],
    baseCurrency: CurrencyCode
  ): BalanceSheetLineItem[] {
    const flattened = flattenTree(nodes);

    return flattened.map(({ node, depth }) => {
      const item: BalanceSheetLineItem = {
        accountId: node.account.id,
        accountCode: node.account.accountCode,
        accountName: node.account.accountName,
        balance: createMoney(Math.abs(node.balance), baseCurrency),
        depth,
        isSubtotal: node.children.length > 0,
        children: node.children.length > 0
          ? this.flattenToLineItems(node.children, baseCurrency)
          : undefined,
      };

      if (node.previousBalance !== undefined) {
        item.previousBalance = createMoney(Math.abs(node.previousBalance), baseCurrency);
        const change = node.balance - node.previousBalance;
        item.change = createMoney(change, baseCurrency);
        item.changePercentage = node.previousBalance !== 0
          ? (change / Math.abs(node.previousBalance)) * 100
          : 0;
      }

      return item;
    });
  }

  private classifyAsset(account: GLAccountData): 'current' | 'fixed' | 'other' {
    const subType = account.subType?.toLowerCase() || '';
    const name = account.accountName.toLowerCase();
    const combined = `${subType} ${name}`;

    if (CURRENT_ASSET_SUBTYPES.some((s) => combined.includes(s))) {
      return 'current';
    }
    if (FIXED_ASSET_SUBTYPES.some((s) => combined.includes(s))) {
      return 'fixed';
    }

    // Default: if code starts with 1 (typical), classify by range
    const code = account.accountCode;
    if (code.startsWith('10') || code.startsWith('11') || code.startsWith('12')) {
      return 'current';
    }
    if (code.startsWith('15') || code.startsWith('16') || code.startsWith('17')) {
      return 'fixed';
    }

    return 'current'; // Default to current
  }

  private classifyLiability(account: GLAccountData): 'current' | 'long_term' | 'other' {
    const subType = account.subType?.toLowerCase() || '';
    const name = account.accountName.toLowerCase();
    const combined = `${subType} ${name}`;

    if (CURRENT_LIABILITY_SUBTYPES.some((s) => combined.includes(s))) {
      return 'current';
    }
    if (LONG_TERM_LIABILITY_SUBTYPES.some((s) => combined.includes(s))) {
      return 'long_term';
    }

    // Default by code range
    const code = account.accountCode;
    if (code.startsWith('20') || code.startsWith('21') || code.startsWith('22')) {
      return 'current';
    }
    if (code.startsWith('25') || code.startsWith('26') || code.startsWith('27')) {
      return 'long_term';
    }

    return 'current'; // Default to current
  }

  private classifyEquity(account: GLAccountData): 'capital' | 'retained' | 'other' {
    const subType = account.subType?.toLowerCase() || '';
    const name = account.accountName.toLowerCase();
    const combined = `${subType} ${name}`;

    if (CAPITAL_SUBTYPES.some((s) => combined.includes(s))) {
      return 'capital';
    }
    if (RETAINED_EARNINGS_SUBTYPES.some((s) => combined.includes(s))) {
      return 'retained';
    }

    return 'other';
  }

  private sumSection(section: BalanceSheetSection, _baseCurrency: CurrencyCode): Money {
    return section.total;
  }

  private calculateRatios(
    assets: BalanceSheetSection,
    liabilities: BalanceSheetSection,
    baseCurrency: CurrencyCode
  ): BalanceSheetRatios {
    const currentAssets = assets.subsections.find((s) => s.key === 'current_assets');
    const currentLiabilities = liabilities.subsections.find((s) => s.key === 'current_liabilities');

    const currentAssetAmount = currentAssets?.subtotal.amount || 0;
    const currentLiabilityAmount = currentLiabilities?.subtotal.amount || 0;

    const ratios: BalanceSheetRatios = {};

    // Current Ratio = Current Assets / Current Liabilities
    if (currentLiabilityAmount > 0) {
      ratios.currentRatio = Math.round((currentAssetAmount / currentLiabilityAmount) * 100) / 100;
    }

    // Working Capital = Current Assets - Current Liabilities
    ratios.workingCapital = createMoney(currentAssetAmount - currentLiabilityAmount, baseCurrency);

    return ratios;
  }
}
