// Reporting service
import type { CurrencyCode, FxRate, Money, UUID } from '@moneio/core-ledger';
import {
  addMoney,
  convertMoney,
  createMoney,
  formatMoney,
  isNegative,
  toDecimal,
} from '@moneio/core-ledger';

export interface ReportingRepository {
  getTransactionsByPeriod(
    workspaceId: UUID,
    startDate: string,
    endDate: string
  ): Promise<TransactionSummary[]>;
  getInvoicesByPeriod(
    workspaceId: UUID,
    startDate: string,
    endDate: string
  ): Promise<InvoiceSummary[]>;
  getLatestFxRates(baseCurrency: CurrencyCode): Promise<FxRate[]>;
  getVatByPeriod(
    workspaceId: UUID,
    startDate: string,
    endDate: string
  ): Promise<VatEntry[]>;
}

export interface TransactionSummary {
  id: UUID;
  postedAt: string;
  amount: Money;
  categoryId?: UUID;
  categoryName?: string;
  categoryType?: 'income' | 'expense' | 'transfer';
}

export interface InvoiceSummary {
  id: UUID;
  issueDate: string;
  total: Money;
  vatTotal: Money;
  status: string;
  merchantName?: string;
}

export interface VatEntry {
  invoiceId: UUID;
  invoiceNumber?: string;
  issueDate: string;
  vatRate: number;
  vatAmount: Money;
  type: 'collected' | 'paid';
  merchantName?: string;
}

// Report types
export interface CashflowReport {
  period: { start: string; end: string };
  baseCurrency: CurrencyCode;
  income: Money;
  expenses: Money;
  netCashflow: Money;
  byCategory: CategoryBreakdown[];
  byMonth: MonthlyBreakdown[];
}

export interface CategoryBreakdown {
  categoryId: UUID;
  categoryName: string;
  type: 'income' | 'expense';
  amount: Money;
  percentage: number;
  transactionCount: number;
}

export interface MonthlyBreakdown {
  month: string; // YYYY-MM
  income: Money;
  expenses: Money;
  netCashflow: Money;
}

export interface VatReport {
  period: { start: string; end: string };
  baseCurrency: CurrencyCode;
  vatCollected: Money;
  vatPaid: Money;
  netVat: Money;
  byRate: VatRateBreakdown[];
  entries: VatEntry[];
}

export interface VatRateBreakdown {
  rate: number;
  rateLabel: string;
  collected: Money;
  paid: Money;
}

export interface DashboardMetrics {
  period: { start: string; end: string };
  baseCurrency: CurrencyCode;
  totalIncome: Money;
  totalExpenses: Money;
  netCashflow: Money;
  burnRate: Money; // Average monthly expenses
  topMerchants: MerchantSpend[];
  categoryBreakdown: CategoryBreakdown[];
  trend: TrendData;
}

export interface MerchantSpend {
  merchantId: UUID;
  merchantName: string;
  totalSpend: Money;
  transactionCount: number;
}

export interface TrendData {
  currentMonth: Money;
  previousMonth: Money;
  changePercentage: number;
  direction: 'up' | 'down' | 'stable';
}

export class ReportingService {
  constructor(private readonly repository: ReportingRepository) {}

  async getCashflowReport(
    workspaceId: UUID,
    startDate: string,
    endDate: string,
    baseCurrency: CurrencyCode
  ): Promise<CashflowReport> {
    const transactions = await this.repository.getTransactionsByPeriod(
      workspaceId,
      startDate,
      endDate
    );
    const fxRates = await this.repository.getLatestFxRates(baseCurrency);

    let income = createMoney(0, baseCurrency);
    let expenses = createMoney(0, baseCurrency);
    const categoryTotals = new Map<string, { amount: number; count: number; name: string; type: string }>();
    const monthlyTotals = new Map<string, { income: number; expenses: number }>();

    for (const tx of transactions) {
      // Convert to base currency if needed
      const amount = this.convertToBaseCurrency(tx.amount, baseCurrency, fxRates);

      if (isNegative(amount)) {
        expenses = addMoney(expenses, { ...amount, amount: Math.abs(amount.amount) });
      } else {
        income = addMoney(income, amount);
      }

      // Category breakdown
      if (tx.categoryId && tx.categoryName) {
        const key = tx.categoryId;
        const existing = categoryTotals.get(key) || { amount: 0, count: 0, name: tx.categoryName, type: tx.categoryType || 'expense' };
        existing.amount += Math.abs(amount.amount);
        existing.count++;
        categoryTotals.set(key, existing);
      }

      // Monthly breakdown
      const month = tx.postedAt.substring(0, 7);
      const monthly = monthlyTotals.get(month) || { income: 0, expenses: 0 };
      if (isNegative(amount)) {
        monthly.expenses += Math.abs(amount.amount);
      } else {
        monthly.income += amount.amount;
      }
      monthlyTotals.set(month, monthly);
    }

    const netCashflow = addMoney(income, {
      ...expenses,
      amount: -expenses.amount,
    });

    const totalAmount = income.amount + expenses.amount;

    const byCategory: CategoryBreakdown[] = Array.from(categoryTotals.entries()).map(
      ([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        type: data.type as 'income' | 'expense',
        amount: createMoney(data.amount / 100, baseCurrency),
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
        transactionCount: data.count,
      })
    );

    const byMonth: MonthlyBreakdown[] = Array.from(monthlyTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        income: createMoney(data.income / 100, baseCurrency),
        expenses: createMoney(data.expenses / 100, baseCurrency),
        netCashflow: createMoney((data.income - data.expenses) / 100, baseCurrency),
      }));

    return {
      period: { start: startDate, end: endDate },
      baseCurrency,
      income,
      expenses,
      netCashflow,
      byCategory,
      byMonth,
    };
  }

  async getVatReport(
    workspaceId: UUID,
    startDate: string,
    endDate: string,
    baseCurrency: CurrencyCode
  ): Promise<VatReport> {
    const vatEntries = await this.repository.getVatByPeriod(workspaceId, startDate, endDate);
    const fxRates = await this.repository.getLatestFxRates(baseCurrency);

    let vatCollected = createMoney(0, baseCurrency);
    let vatPaid = createMoney(0, baseCurrency);
    const byRate = new Map<number, { collected: number; paid: number }>();

    for (const entry of vatEntries) {
      const amount = this.convertToBaseCurrency(entry.vatAmount, baseCurrency, fxRates);

      if (entry.type === 'collected') {
        vatCollected = addMoney(vatCollected, amount);
      } else {
        vatPaid = addMoney(vatPaid, amount);
      }

      // By rate breakdown
      const rateData = byRate.get(entry.vatRate) || { collected: 0, paid: 0 };
      if (entry.type === 'collected') {
        rateData.collected += amount.amount;
      } else {
        rateData.paid += amount.amount;
      }
      byRate.set(entry.vatRate, rateData);
    }

    const netVat = addMoney(vatCollected, { ...vatPaid, amount: -vatPaid.amount });

    const byRateBreakdown: VatRateBreakdown[] = Array.from(byRate.entries()).map(
      ([rate, data]) => ({
        rate,
        rateLabel: `${(rate * 100).toFixed(0)}%`,
        collected: createMoney(data.collected / 100, baseCurrency),
        paid: createMoney(data.paid / 100, baseCurrency),
      })
    );

    return {
      period: { start: startDate, end: endDate },
      baseCurrency,
      vatCollected,
      vatPaid,
      netVat,
      byRate: byRateBreakdown,
      entries: vatEntries,
    };
  }

  async getDashboardMetrics(
    workspaceId: UUID,
    startDate: string,
    endDate: string,
    baseCurrency: CurrencyCode
  ): Promise<DashboardMetrics> {
    const cashflow = await this.getCashflowReport(
      workspaceId,
      startDate,
      endDate,
      baseCurrency
    );

    // Calculate burn rate (average monthly expenses)
    const months = cashflow.byMonth.length || 1;
    const burnRate = createMoney(toDecimal(cashflow.expenses) / months, baseCurrency);

    // Calculate trend
    const currentMonth = cashflow.byMonth[cashflow.byMonth.length - 1];
    const previousMonth = cashflow.byMonth[cashflow.byMonth.length - 2];

    let trend: TrendData;
    if (currentMonth && previousMonth) {
      const current = toDecimal(currentMonth.netCashflow);
      const previous = toDecimal(previousMonth.netCashflow);
      const change = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;

      trend = {
        currentMonth: currentMonth.netCashflow,
        previousMonth: previousMonth.netCashflow,
        changePercentage: Math.abs(change),
        direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
      };
    } else {
      trend = {
        currentMonth: currentMonth?.netCashflow || createMoney(0, baseCurrency),
        previousMonth: createMoney(0, baseCurrency),
        changePercentage: 0,
        direction: 'stable',
      };
    }

    return {
      period: { start: startDate, end: endDate },
      baseCurrency,
      totalIncome: cashflow.income,
      totalExpenses: cashflow.expenses,
      netCashflow: cashflow.netCashflow,
      burnRate,
      topMerchants: [], // TODO: Implement merchant aggregation
      categoryBreakdown: cashflow.byCategory,
      trend,
    };
  }

  formatMoneyForDisplay(money: Money, locale = 'en-US'): string {
    return formatMoney(money, locale);
  }

  private convertToBaseCurrency(
    amount: Money,
    baseCurrency: CurrencyCode,
    fxRates: FxRate[]
  ): Money {
    if (amount.currency === baseCurrency) {
      return amount;
    }

    const rate = fxRates.find(
      (r) => r.baseCurrency === amount.currency && r.quoteCurrency === baseCurrency
    );

    if (!rate) {
      // If no rate found, return as-is (logged as warning in production)
      console.warn(`No FX rate found for ${amount.currency} -> ${baseCurrency}`);
      return { ...amount, currency: baseCurrency };
    }

    return convertMoney(amount, rate);
  }
}
