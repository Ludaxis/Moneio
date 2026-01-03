/**
 * Profit & Loss Statement Service
 *
 * Generates Income Statement reports from GL data.
 * Supports comparative analysis and monthly breakdowns.
 */

import type { CurrencyCode, Money, UUID } from '@moneio/core-ledger';
import { createMoney } from '@moneio/core-ledger';

import { buildAccountTree, flattenTree } from './repository';
import type { ReportRepository, AccountTreeNode } from './repository';
import type {
  ProfitLossStatement,
  ProfitLossSection,
  ProfitLossLineItem,
  ProfitLossMonthly,
  ProfitLossInput,
  ReportMetadata,
} from './types';

/**
 * Account subtypes for P&L classification
 */
const REVENUE_SUBTYPES = ['revenue', 'sales', 'income', 'service_revenue'];
const COGS_SUBTYPES = ['cogs', 'cost_of_sales', 'cost_of_goods_sold', 'direct_cost'];
const OTHER_INCOME_SUBTYPES = ['other_income', 'interest_income', 'gain'];
const OTHER_EXPENSE_SUBTYPES = ['other_expense', 'interest_expense', 'loss'];

export class ProfitLossService {
  constructor(private readonly repository: ReportRepository) {}

  async generate(input: ProfitLossInput): Promise<ProfitLossStatement> {
    const { workspaceId, startDate, endDate, baseCurrency, options, previousPeriod } = input;

    // Fetch data
    const [accounts, currentBalances] = await Promise.all([
      this.repository.getGLAccounts(workspaceId),
      this.repository.getGLAccountBalancesForPeriod(workspaceId, startDate, endDate),
    ]);

    // Fetch previous period if comparative
    let previousBalances: Map<UUID, number> | undefined;
    if (previousPeriod && options?.comparative) {
      const prevBalanceData = await this.repository.getGLAccountBalancesForPeriod(
        workspaceId,
        previousPeriod.start,
        previousPeriod.end
      );
      previousBalances = new Map(prevBalanceData.map((b) => [b.accountId, b.balance]));
    }

    // Create balance maps
    const balanceMap = new Map(currentBalances.map((b) => [b.accountId, b.balance]));

    // Filter to income and expense accounts
    const incomeExpenseAccounts = accounts.filter(
      (a) => a.accountType === 'INCOME' || a.accountType === 'EXPENSE'
    );

    // Build account tree
    const tree = buildAccountTree(incomeExpenseAccounts, balanceMap, previousBalances);

    // Classify accounts into sections
    const sections = this.classifyAccounts(tree, previousBalances, baseCurrency);

    // Calculate summaries
    const summaries = this.calculateSummaries(sections, baseCurrency, !!previousPeriod);

    // Generate monthly breakdown if requested
    let monthlyBreakdown: ProfitLossMonthly[] | undefined;
    if (options?.groupBy === 'month') {
      monthlyBreakdown = await this.generateMonthlyBreakdown(
        workspaceId,
        startDate,
        endDate,
        baseCurrency
      );
    }

    const metadata: ReportMetadata = {
      generatedAt: new Date().toISOString(),
      workspaceId,
      baseCurrency,
      period: { start: startDate, end: endDate },
    };

    return {
      metadata,
      sections,
      summaries,
      monthlyBreakdown,
    };
  }

  private classifyAccounts(
    tree: AccountTreeNode[],
    previousBalances: Map<UUID, number> | undefined,
    baseCurrency: CurrencyCode
  ): ProfitLossStatement['sections'] {
    const classifyNode = (
      node: AccountTreeNode
    ): 'revenue' | 'cogs' | 'operatingExpenses' | 'otherIncome' | 'otherExpenses' => {
      const account = node.account;
      const subType = account.subType?.toLowerCase() || '';

      if (account.accountType === 'INCOME') {
        if (REVENUE_SUBTYPES.some((s) => subType.includes(s)) || !subType) {
          return 'revenue';
        }
        if (OTHER_INCOME_SUBTYPES.some((s) => subType.includes(s))) {
          return 'otherIncome';
        }
        return 'revenue'; // Default income to revenue
      }

      if (account.accountType === 'EXPENSE') {
        if (COGS_SUBTYPES.some((s) => subType.includes(s))) {
          return 'cogs';
        }
        if (OTHER_EXPENSE_SUBTYPES.some((s) => subType.includes(s))) {
          return 'otherExpenses';
        }
        return 'operatingExpenses'; // Default expense to operating
      }

      return 'operatingExpenses';
    };

    const sections: Record<string, AccountTreeNode[]> = {
      revenue: [],
      cogs: [],
      operatingExpenses: [],
      otherIncome: [],
      otherExpenses: [],
    };

    // Classify each root node
    for (const node of tree) {
      const classification = classifyNode(node);
      sections[classification].push(node);
    }

    const buildSection = (
      name: string,
      key: string,
      nodes: AccountTreeNode[]
    ): ProfitLossSection => {
      const items = this.flattenToLineItems(nodes, baseCurrency);
      const subtotal = this.sumNodes(nodes, baseCurrency);
      const previousSubtotal = previousBalances
        ? this.sumNodesPrevious(nodes, baseCurrency)
        : undefined;

      return {
        name,
        key,
        items,
        subtotal,
        previousSubtotal,
      };
    };

    return {
      revenue: buildSection('Revenue', 'revenue', sections.revenue),
      costOfGoodsSold: buildSection('Cost of Goods Sold', 'cogs', sections.cogs),
      operatingExpenses: buildSection(
        'Operating Expenses',
        'operatingExpenses',
        sections.operatingExpenses
      ),
      otherIncome: buildSection('Other Income', 'otherIncome', sections.otherIncome),
      otherExpenses: buildSection('Other Expenses', 'otherExpenses', sections.otherExpenses),
    };
  }

  private flattenToLineItems(
    nodes: AccountTreeNode[],
    baseCurrency: CurrencyCode
  ): ProfitLossLineItem[] {
    const flattened = flattenTree(nodes);

    return flattened.map(({ node, depth }) => {
      const item: ProfitLossLineItem = {
        accountId: node.account.id,
        accountCode: node.account.accountCode,
        accountName: node.account.accountName,
        amount: createMoney(Math.abs(node.balance), baseCurrency),
        depth,
        isSubtotal: node.children.length > 0,
        children:
          node.children.length > 0
            ? this.flattenToLineItems(node.children, baseCurrency)
            : undefined,
      };

      if (node.previousBalance !== undefined) {
        item.previousAmount = createMoney(Math.abs(node.previousBalance), baseCurrency);
        const change = node.balance - node.previousBalance;
        item.change = createMoney(change, baseCurrency);
        item.changePercentage =
          node.previousBalance !== 0 ? (change / Math.abs(node.previousBalance)) * 100 : 0;
      }

      return item;
    });
  }

  private sumNodes(nodes: AccountTreeNode[], baseCurrency: CurrencyCode): Money {
    const total = nodes.reduce((sum, node) => sum + Math.abs(node.balance), 0);
    return createMoney(total, baseCurrency);
  }

  private sumNodesPrevious(nodes: AccountTreeNode[], baseCurrency: CurrencyCode): Money {
    const total = nodes.reduce((sum, node) => sum + Math.abs(node.previousBalance || 0), 0);
    return createMoney(total, baseCurrency);
  }

  private calculateSummaries(
    sections: ProfitLossStatement['sections'],
    baseCurrency: CurrencyCode,
    hasComparative: boolean
  ): ProfitLossStatement['summaries'] {
    const revenue = sections.revenue.subtotal.amount;
    const cogs = sections.costOfGoodsSold.subtotal.amount;
    const opex = sections.operatingExpenses.subtotal.amount;
    const otherInc = sections.otherIncome.subtotal.amount;
    const otherExp = sections.otherExpenses.subtotal.amount;

    const grossProfit = revenue - cogs;
    const operatingIncome = grossProfit - opex;
    const netIncome = operatingIncome + otherInc - otherExp;

    // Don't use createMoney - amounts are already in minor units (cents)
    const summaries: ProfitLossStatement['summaries'] = {
      grossProfit: { amount: grossProfit, currency: baseCurrency, decimalPlaces: 2 },
      operatingIncome: { amount: operatingIncome, currency: baseCurrency, decimalPlaces: 2 },
      netIncome: { amount: netIncome, currency: baseCurrency, decimalPlaces: 2 },
    };

    if (hasComparative) {
      const prevRevenue = sections.revenue.previousSubtotal?.amount || 0;
      const prevCogs = sections.costOfGoodsSold.previousSubtotal?.amount || 0;
      const prevOpex = sections.operatingExpenses.previousSubtotal?.amount || 0;
      const prevOtherInc = sections.otherIncome.previousSubtotal?.amount || 0;
      const prevOtherExp = sections.otherExpenses.previousSubtotal?.amount || 0;

      // Don't use createMoney - amounts are already in minor units
      summaries.previousGrossProfit = { amount: prevRevenue - prevCogs, currency: baseCurrency, decimalPlaces: 2 };
      summaries.previousOperatingIncome = { amount: prevRevenue - prevCogs - prevOpex, currency: baseCurrency, decimalPlaces: 2 };
      summaries.previousNetIncome = { amount: prevRevenue - prevCogs - prevOpex + prevOtherInc - prevOtherExp, currency: baseCurrency, decimalPlaces: 2 };
    }

    return summaries;
  }

  private async generateMonthlyBreakdown(
    workspaceId: UUID,
    startDate: string,
    endDate: string,
    _baseCurrency: CurrencyCode
  ): Promise<ProfitLossMonthly[]> {
    const transactions = await this.repository.getTransactionsForPeriod(
      workspaceId,
      startDate,
      endDate
    );

    const monthlyTotals = new Map<string, { revenue: number; expenses: number }>();

    for (const tx of transactions) {
      const month = tx.postedAt.substring(0, 7);
      const existing = monthlyTotals.get(month) || { revenue: 0, expenses: 0 };

      if (tx.amount >= 0) {
        existing.revenue += tx.amount;
      } else {
        existing.expenses += Math.abs(tx.amount);
      }

      monthlyTotals.set(month, existing);
    }

    return Array.from(monthlyTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        netIncome: data.revenue - data.expenses,
      }));
  }
}
