'use client';

import { cn } from '@moneio/ui';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  DollarSign,
  FileText,
  Heart,
  Loader2,
  Receipt,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Line,
  Area,
  AreaChart,
} from 'recharts';

import { useLocaleFormat } from '@/hooks/use-locale-format';
import { useTranslateCategory } from '@/hooks/use-translate-category';
import { extractLocaleFromPath } from '@/lib/i18n';
import { useWorkspace } from '@/lib/workspace';

type ReportTab =
  | 'cashflow'
  | 'profit-loss'
  | 'balance-sheet'
  | 'forecast'
  | 'aged-ar'
  | 'vat'
  | 'general-ledger';

interface HealthScore {
  overallScore: number;
  rating: string;
  grade: string;
  summary: string;
  currency: string;
  metrics: Array<{
    name: string;
    score: number;
    weight: number;
    rating: string;
    description: string;
    recommendation: string;
  }>;
  recommendations: string[];
  data: {
    currentBalance: number;
    avgMonthlyIncome: number;
    avgMonthlyExpenses: number;
    runwayMonths: number;
    transactionsAnalyzed: number;
  };
}

interface CashflowReport {
  period: { start: string; end: string };
  baseCurrency: string;
  income: { amount: number; currency: string; formatted: string };
  expenses: { amount: number; currency: string; formatted: string };
  netCashflow: { amount: number; currency: string; formatted: string };
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    type: string;
    amount: number;
    currency: string;
    formatted: string;
    percentage: number;
    transactionCount: number;
  }>;
  byMonth: Array<{
    month: string;
    income: { amount: number; formatted: string };
    expenses: { amount: number; formatted: string };
    netCashflow: { amount: number; formatted: string };
  }>;
}

interface ProfitLossReport {
  metadata: { startDate: string; endDate: string; currency: string };
  sections: {
    revenue: ReportSection;
    costOfGoodsSold: ReportSection;
    operatingExpenses: ReportSection;
    otherIncome: ReportSection;
    otherExpenses: ReportSection;
  };
  summaries: {
    grossProfit: MoneyValue;
    operatingIncome: MoneyValue;
    netIncome: MoneyValue;
  };
}

interface ReportSection {
  name: string;
  key: string;
  items: Array<{
    accountName: string;
    amount: MoneyValue;
    isSubtotal?: boolean;
  }>;
  subtotal: MoneyValue;
}

interface MoneyValue {
  amount: number;
  currency: string;
  formatted: string;
}

interface BalanceSheetReport {
  metadata: { asOfDate: string; currency: string };
  sections: {
    assets: BalanceSection;
    liabilities: BalanceSection;
    equity: BalanceSection;
  };
  summaries: {
    totalAssets: MoneyValue;
    totalLiabilities: MoneyValue;
    totalEquity: MoneyValue;
    isBalanced: boolean;
  };
  ratios?: {
    currentRatio: number;
    quickRatio: number;
    debtToEquity: number;
    workingCapital?: MoneyValue;
  };
}

interface BalanceSection {
  name: string;
  key: string;
  subsections: Array<{
    name: string;
    key: string;
    items: Array<{
      accountName: string;
      balance: MoneyValue;
      isSubtotal?: boolean;
    }>;
    subtotal: MoneyValue;
  }>;
  total: MoneyValue;
}

interface ForecastReport {
  currency: string;
  currentBalance: number;
  overallConfidence: number;
  months: Array<{
    month: string;
    label: string;
    projectedIncome: number;
    projectedExpenses: number;
    netCashflow: number;
    projectedBalance: number;
    confidence: number;
    isActual: boolean;
  }>;
  summary: {
    avgMonthlyIncome: number;
    avgMonthlyExpenses: number;
    totalRecurringExpenses: number;
    totalRecurringIncome: number;
    endingBalance: number;
    monthsUntilNegative: number | null;
    trend: string;
    insights: string[];
  };
  recurring: {
    expenses: Array<{ name: string; amount: number; frequency: string; monthlyAmount: number }>;
    income: Array<{ name: string; amount: number; frequency: string; monthlyAmount: number }>;
  };
}

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
}

interface AgedReceivablesReport {
  type: string;
  asOfDate: string;
  buckets: Array<string | AgingBucket>;
  byCounterparty: Array<{
    counterpartyId: string;
    counterpartyName: string;
    items: Array<{
      id: string;
      documentNumber: string;
      issueDate: string;
      dueDate: string;
      originalAmount: MoneyValue;
      outstandingAmount: MoneyValue;
      daysOverdue: number;
      bucket: string;
    }>;
    totalOutstanding: MoneyValue;
  }>;
  bucketSummary: Record<string, MoneyValue>;
  totalOutstanding: MoneyValue;
  totalOverdue: MoneyValue;
  overduePercentage: number;
  averageDaysOutstanding: number;
}

interface VatReport {
  period: { start: string; end: string };
  baseCurrency: string;
  vatCollected: MoneyValue;
  vatPaid: MoneyValue;
  netVat: MoneyValue & { isRefund: boolean };
  byRate: Array<{
    rate: number;
    rateLabel: string;
    collected: MoneyValue;
    paid: MoneyValue;
  }>;
  entries: Array<{
    invoiceId: string;
    invoiceNumber: string;
    issueDate: string;
    vatRate: number;
    vatRateLabel: string;
    vatAmount: MoneyValue;
    type: string;
    merchantName: string;
  }>;
}

interface GeneralLedgerReport {
  metadata: {
    generatedAt: string;
    workspaceId: string;
    baseCurrency: string;
    period: { start: string; end: string };
  };
  accounts: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    openingBalance: MoneyValue;
    entries: Array<{
      entryId: string;
      entryNumber: string;
      entryDate: string;
      description: string;
      referenceType: string;
      referenceId: string | null;
      debit: MoneyValue;
      credit: MoneyValue;
      runningBalance: MoneyValue;
    }>;
    totalDebits: MoneyValue;
    totalCredits: MoneyValue;
    closingBalance: MoneyValue;
  }>;
  summary: {
    totalDebits: MoneyValue;
    totalCredits: MoneyValue;
    accountCount: number;
    entryCount: number;
  };
}

const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

const gradeColors: Record<string, { bg: string; text: string }> = {
  A: { bg: 'bg-success-100', text: 'text-success-700' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700' },
  C: { bg: 'bg-warning-100', text: 'text-warning-700' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700' },
  F: { bg: 'bg-danger-100', text: 'text-danger-700' },
};

export default function ReportsPage() {
  const pathname = usePathname();
  const t = useTranslations('reports');
  const tHealthRatings = useTranslations('dashboard.healthScore.ratings');
  const tHealthSummaries = useTranslations('dashboard.healthScore.summaries');
  const tHealthMetrics = useTranslations('dashboard.healthScore.metrics');
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const workspaceId = workspace?.id;
  const translateCategory = useTranslateCategory();
  const { formatNumber, intlLocale } = useLocaleFormat();

  const locale = extractLocaleFromPath(pathname);

  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Report data state
  const [activeTab, setActiveTab] = useState<ReportTab>('cashflow');
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [cashflowReport, setCashflowReport] = useState<CashflowReport | null>(null);
  const [profitLossReport, setProfitLossReport] = useState<ProfitLossReport | null>(null);
  const [balanceSheetReport, setBalanceSheetReport] = useState<BalanceSheetReport | null>(null);
  const [forecastReport, setForecastReport] = useState<ForecastReport | null>(null);
  const [agedReceivablesReport, setAgedReceivablesReport] = useState<AgedReceivablesReport | null>(
    null
  );
  const [vatReport, setVatReport] = useState<VatReport | null>(null);
  const [generalLedgerReport, setGeneralLedgerReport] = useState<GeneralLedgerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthScore = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await fetch(`/api/reports/health-score?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setHealthScore(data);
      }
    } catch (err) {
      console.warn('Failed to fetch health score:', err);
    }
  }, [workspaceId]);

  const fetchCashflow = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const params = new URLSearchParams({
        workspaceId,
        startDate,
        endDate,
      });
      const response = await fetch(`/api/reports/cashflow?${params}`);
      if (response.ok) {
        const data = await response.json();
        setCashflowReport(data);
      } else {
        throw new Error('Failed to fetch cashflow report');
      }
    } catch (err) {
      console.error('Failed to fetch cashflow:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }, [workspaceId, startDate, endDate]);

  const fetchProfitLoss = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const params = new URLSearchParams({
        workspaceId,
        startDate,
        endDate,
      });
      const response = await fetch(`/api/reports/profit-loss?${params}`);
      if (response.ok) {
        const data = await response.json();
        setProfitLossReport(data);
      } else {
        throw new Error('Failed to fetch P&L report');
      }
    } catch (err) {
      console.error('Failed to fetch P&L:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }, [workspaceId, startDate, endDate]);

  const fetchBalanceSheet = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const params = new URLSearchParams({
        workspaceId,
        asOfDate: endDate,
      });
      const response = await fetch(`/api/reports/balance-sheet?${params}`);
      if (response.ok) {
        const data = await response.json();
        setBalanceSheetReport(data);
      } else {
        throw new Error('Failed to fetch balance sheet');
      }
    } catch (err) {
      console.error('Failed to fetch balance sheet:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }, [workspaceId, endDate]);

  const fetchForecast = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const params = new URLSearchParams({
        workspaceId,
        months: '6',
      });
      const response = await fetch(`/api/reports/forecast?${params}`);
      if (response.ok) {
        const data = await response.json();
        setForecastReport(data);
      } else {
        throw new Error('Failed to fetch forecast');
      }
    } catch (err) {
      console.error('Failed to fetch forecast:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }, [workspaceId]);

  const fetchAgedReceivables = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const params = new URLSearchParams({
        workspaceId,
        type: 'receivables',
        asOfDate: endDate,
      });
      const response = await fetch(`/api/reports/aged-receivables?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAgedReceivablesReport(data);
      } else {
        throw new Error('Failed to fetch aged receivables');
      }
    } catch (err) {
      console.error('Failed to fetch aged receivables:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }, [workspaceId, endDate]);

  const fetchVat = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const params = new URLSearchParams({
        workspaceId,
        startDate,
        endDate,
      });
      const response = await fetch(`/api/reports/vat?${params}`);
      if (response.ok) {
        const data = await response.json();
        setVatReport(data);
      } else {
        throw new Error('Failed to fetch VAT report');
      }
    } catch (err) {
      console.error('Failed to fetch VAT:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }, [workspaceId, startDate, endDate]);

  const fetchGeneralLedger = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const params = new URLSearchParams({
        workspaceId,
        startDate,
        endDate,
      });
      const response = await fetch(`/api/reports/general-ledger?${params}`);
      if (response.ok) {
        const data = await response.json();
        setGeneralLedgerReport(data);
      } else {
        throw new Error('Failed to fetch general ledger');
      }
    } catch (err) {
      console.error('Failed to fetch general ledger:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  }, [workspaceId, startDate, endDate]);

  const fetchActiveReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      switch (activeTab) {
        case 'cashflow':
          await fetchCashflow();
          break;
        case 'profit-loss':
          await fetchProfitLoss();
          break;
        case 'balance-sheet':
          await fetchBalanceSheet();
          break;
        case 'forecast':
          await fetchForecast();
          break;
        case 'aged-ar':
          await fetchAgedReceivables();
          break;
        case 'vat':
          await fetchVat();
          break;
        case 'general-ledger':
          await fetchGeneralLedger();
          break;
      }
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    fetchCashflow,
    fetchProfitLoss,
    fetchBalanceSheet,
    fetchForecast,
    fetchAgedReceivables,
    fetchVat,
    fetchGeneralLedger,
  ]);

  useEffect(() => {
    if (workspaceId) {
      fetchHealthScore();
      fetchActiveReport();
    }
  }, [workspaceId, fetchHealthScore, fetchActiveReport]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(intlLocale, {
      month: 'short',
      year: '2-digit',
    });
  };

  // Helper to translate health score summary
  const translateHealthSummary = (summary: string, rating: string): string => {
    // Known valid area keys that have translations
    const validAreaKeys = ['profitability', 'runway', 'cashflow', 'savings', 'liquidity', 'stability', 'growth', 'efficiency'];

    // Extract the area from the summary - look for "on <area>" or "Focus on <area>"
    const areaMatch = summary.match(/(?:focus |work |improve )?on\s+(\w+)/i);
    let areaKey = areaMatch?.[1]?.toLowerCase() || '';

    // Only use the area key if it's a known valid key
    if (!validAreaKeys.includes(areaKey)) {
      areaKey = '';
    }

    // Translate the area name if we have a valid key
    let translatedArea = areaKey;
    if (areaKey) {
      try {
        const translated = tHealthMetrics(areaKey);
        // Check if translation succeeded (not just returned the key)
        if (translated && translated !== areaKey) {
          translatedArea = translated;
        }
      } catch {
        // Keep original if no translation
      }
    }

    try {
      const ratingKey = rating.toLowerCase();
      if (translatedArea) {
        return tHealthSummaries(ratingKey, { area: translatedArea });
      }
      // If no valid area, just return the rating translation without area parameter
      return tHealthSummaries(ratingKey, { area: '' });
    } catch {
      return summary;
    }
  };

  // Chart data
  const cashflowChartData = useMemo(() => {
    if (!cashflowReport?.byMonth) return [];
    return cashflowReport.byMonth.map((m) => ({
      month: formatMonth(m.month),
      Income: m.income.amount,
      Expenses: Math.abs(m.expenses.amount),
      'Net Cashflow': m.netCashflow.amount,
    }));
  }, [cashflowReport, locale]);

  const categoryPieData = useMemo(() => {
    if (!cashflowReport?.byCategory) return [];
    return cashflowReport.byCategory
      .filter((c) => c.type === 'expense' && c.amount > 0)
      .slice(0, 8)
      .map((c) => ({
        name: translateCategory(c.categoryName) || t('uncategorized'),
        value: Math.abs(c.amount),
        percentage: c.percentage,
      }));
  }, [cashflowReport, translateCategory, t]);

  if (workspaceLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t('selectWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchHealthScore();
              fetchActiveReport();
            }}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* Financial Health Score */}
      {healthScore && (
        <div className="grid gap-4 md:grid-cols-4">
          {/* Main Score Card */}
          <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-6 md:col-span-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Heart className="h-5 w-5" />
              <span className="text-sm font-medium">{t('financialHealthScore')}</span>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div
                className={cn(
                  'flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold',
                  gradeColors[healthScore.grade]?.bg || 'bg-muted',
                  gradeColors[healthScore.grade]?.text || 'text-foreground'
                )}
              >
                {healthScore.grade}
              </div>
              <div className="flex-1">
                <p className="text-3xl font-bold text-foreground">{formatNumber(healthScore.overallScore)}/{formatNumber(100)}</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {(() => {
                    try {
                      return tHealthRatings(healthScore.rating.toLowerCase());
                    } catch {
                      return healthScore.rating;
                    }
                  })()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {translateHealthSummary(healthScore.summary, healthScore.rating)}
                </p>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">{t('avgMonthlyIncome')}</span>
            </div>
            <p className="mt-2 text-xl font-bold text-success-600">
              {formatCurrency(healthScore.data.avgMonthlyIncome, healthScore.currency)}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm">{t('avgMonthlyExpenses')}</span>
            </div>
            <p className="mt-2 text-xl font-bold text-danger-600">
              {formatCurrency(healthScore.data.avgMonthlyExpenses, healthScore.currency)}
            </p>
          </div>
        </div>
      )}

      {/* Date Range Picker */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{t('period')}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-muted-foreground">{t('to')}</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              setStartDate(start.toISOString().split('T')[0]);
              setEndDate(now.toISOString().split('T')[0]);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            {t('thisMonth')}
          </button>
          <button
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), 0, 1);
              setStartDate(start.toISOString().split('T')[0]);
              setEndDate(now.toISOString().split('T')[0]);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            {t('ytd')}
          </button>
          <button
            onClick={() => {
              const now = new Date();
              now.setMonth(now.getMonth() - 12);
              setStartDate(now.toISOString().split('T')[0]);
              setEndDate(new Date().toISOString().split('T')[0]);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            {t('last12Months')}
          </button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('cashflow')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'cashflow'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('cashflow')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('profit-loss')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'profit-loss'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t('profitLoss')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('balance-sheet')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'balance-sheet'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4" />
              {t('balanceSheet')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'forecast'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('forecast')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('aged-ar')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'aged-ar'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('agedAR')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('vat')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'vat'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              {t('vat')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('general-ledger')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'general-ledger'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {t('generalLedger')}
            </div>
          </button>
        </div>
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-12 w-12 text-danger-500" />
          <p className="text-danger-600">{error}</p>
          <button
            onClick={fetchActiveReport}
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <RefreshCw className="h-4 w-4" />
            {t('tryAgain')}
          </button>
        </div>
      ) : activeTab === 'cashflow' && cashflowReport ? (
        <CashflowReportView
          report={cashflowReport}
          chartData={cashflowChartData}
          pieData={categoryPieData}
          translateCategory={translateCategory}
          intlLocale={intlLocale}
        />
      ) : activeTab === 'profit-loss' && profitLossReport ? (
        <ProfitLossReportView report={profitLossReport} intlLocale={intlLocale} />
      ) : activeTab === 'balance-sheet' && balanceSheetReport ? (
        <BalanceSheetReportView report={balanceSheetReport} intlLocale={intlLocale} />
      ) : activeTab === 'forecast' && forecastReport ? (
        <ForecastReportView report={forecastReport} formatCurrency={formatCurrency} intlLocale={intlLocale} />
      ) : activeTab === 'aged-ar' && agedReceivablesReport ? (
        <AgedReceivablesReportView report={agedReceivablesReport} intlLocale={intlLocale} />
      ) : activeTab === 'vat' && vatReport ? (
        <VatReportView report={vatReport} intlLocale={intlLocale} />
      ) : activeTab === 'general-ledger' && generalLedgerReport ? (
        <GeneralLedgerReportView report={generalLedgerReport} intlLocale={intlLocale} />
      ) : (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
          <BarChart3 className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium text-foreground">{t('noDataAvailable')}</p>
          <p className="text-sm text-muted-foreground">{t('importTransactions')}</p>
        </div>
      )}
    </div>
  );
}

// Cashflow Report View
function CashflowReportView({
  report,
  chartData,
  pieData,
  translateCategory,
  intlLocale,
}: {
  report: CashflowReport;
  chartData: Array<Record<string, string | number>>;
  pieData: Array<{ name: string; value: number; percentage: number }>;
  translateCategory: (name: string | null | undefined) => string;
  intlLocale: string;
}) {
  const t = useTranslations('reports');

  // Local formatting functions using intlLocale
  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number) => new Intl.NumberFormat(intlLocale).format(num);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-success-200 bg-success-50 p-4">
          <div className="flex items-center gap-2 text-success-700">
            <ArrowUpRight className="h-4 w-4" />
            <span className="text-sm">{t('totalIncome')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-success-700">
            {formatCurrencyLocal(report.income.amount, report.income.currency)}
          </p>
        </div>

        <div className="rounded-lg border border-danger-200 bg-danger-50 p-4">
          <div className="flex items-center gap-2 text-danger-700">
            <ArrowDownRight className="h-4 w-4" />
            <span className="text-sm">{t('totalExpenses')}</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-danger-700">
            {formatCurrencyLocal(Math.abs(report.expenses.amount), report.expenses.currency)}
          </p>
        </div>

        <div
          className={cn(
            'rounded-lg border p-4',
            report.netCashflow.amount >= 0
              ? 'border-success-200 bg-success-50'
              : 'border-danger-200 bg-danger-50'
          )}
        >
          <div
            className={cn(
              'flex items-center gap-2',
              report.netCashflow.amount >= 0 ? 'text-success-700' : 'text-danger-700'
            )}
          >
            <DollarSign className="h-4 w-4" />
            <span className="text-sm">{t('netCashFlow')}</span>
          </div>
          <p
            className={cn(
              'mt-2 text-2xl font-bold',
              report.netCashflow.amount >= 0 ? 'text-success-700' : 'text-danger-700'
            )}
          >
            {formatCurrencyLocal(report.netCashflow.amount, report.netCashflow.currency)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend Chart */}
        {chartData.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-4 font-medium text-foreground">{t('monthlyCashFlow')}</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={200}>
                <BarChart data={chartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => formatNumber(value)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border border-border bg-card p-2 shadow-lg">
                            <p className="font-medium text-foreground mb-1">{label}</p>
                            {payload.map((entry, index) => (
                              <p key={index} style={{ color: entry.color }} className="text-sm">
                                {entry.dataKey === 'Income' ? t('income') : t('expenses')}: {formatCurrencyLocal(entry.value as number, report.income.currency)}
                              </p>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Category Breakdown Pie Chart */}
        {pieData.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-4 font-medium text-foreground">{t('expenseBreakdown')}</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={200}>
                <RechartsPieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as { name: string; value: number; percentage: number };
                        return (
                          <div className="rounded-lg border border-border bg-card p-2 shadow-lg">
                            <p className="font-medium text-foreground">{data.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrencyLocal(data.value, report.income.currency)} ({formatNumber(data.percentage)}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Category Details */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-medium text-foreground">{t('categoryDetails')}</h3>
        </div>
        <div className="divide-y divide-border">
          {report.byCategory.map((cat) => (
            <div key={cat.categoryId} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    cat.type === 'income' ? 'bg-success-100' : 'bg-danger-100'
                  )}
                >
                  {cat.type === 'income' ? (
                    <ArrowUpRight className="h-4 w-4 text-success-600" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-danger-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {translateCategory(cat.categoryName) || t('uncategorized')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(cat.transactionCount)} {t('transactions')}
                  </p>
                </div>
              </div>
              <div className="text-end">
                <p
                  className={cn(
                    'font-medium',
                    cat.type === 'income' ? 'text-success-600' : 'text-danger-600'
                  )}
                >
                  {formatCurrencyLocal(Math.abs(cat.amount), report.income.currency)}
                </p>
                <p className="text-xs text-muted-foreground">{formatNumber(cat.percentage)}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Profit & Loss Report View
function ProfitLossReportView({ report, intlLocale }: { report: ProfitLossReport; intlLocale: string }) {
  const t = useTranslations('reports');

  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper to format MoneyValue with fallback to pre-formatted string
  const formatMoneyValue = (value: MoneyValue) => {
    // If amount is defined and not zero, use locale-aware formatting
    if (typeof value.amount === 'number' && value.amount !== 0) {
      return formatCurrencyLocal(value.amount, value.currency);
    }
    // Check if formatted has a non-zero value (fallback for when amount is 0 but formatted is correct)
    if (value.formatted && !value.formatted.match(/^[€$£¥₹₱₩]?\s*0([.,]0+)?$/)) {
      return value.formatted;
    }
    // Default to locale-aware zero
    return formatCurrencyLocal(0, value.currency);
  };

  // Helper to get the actual amount (for color logic)
  const getAmount = (value: MoneyValue): number => {
    if (typeof value.amount === 'number' && value.amount !== 0) {
      return value.amount;
    }
    // Try to parse from formatted string
    const match = value.formatted?.match(/[-−]?[\d.,]+/);
    if (match) {
      const parsed = parseFloat(match[0].replace(/,/g, ''));
      if (value.formatted?.includes('-') || value.formatted?.includes('−')) {
        return -parsed;
      }
      return parsed;
    }
    return 0;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('grossProfit')}</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              getAmount(report.summaries.grossProfit) >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {formatMoneyValue(report.summaries.grossProfit)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('operatingIncome')}</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              getAmount(report.summaries.operatingIncome) >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {formatMoneyValue(report.summaries.operatingIncome)}
          </p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-4',
            getAmount(report.summaries.netIncome) >= 0
              ? 'border-success-200 bg-success-50'
              : 'border-danger-200 bg-danger-50'
          )}
        >
          <p
            className={cn(
              'text-sm',
              getAmount(report.summaries.netIncome) >= 0 ? 'text-success-700' : 'text-danger-700'
            )}
          >
            {t('netIncome')}
          </p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              getAmount(report.summaries.netIncome) >= 0 ? 'text-success-700' : 'text-danger-700'
            )}
          >
            {formatMoneyValue(report.summaries.netIncome)}
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <PLSection section={report.sections.revenue} sectionKey="revenue" isPositive intlLocale={intlLocale} />
        <PLSection section={report.sections.costOfGoodsSold} sectionKey="costOfGoodsSold" intlLocale={intlLocale} />
        <PLSection section={report.sections.operatingExpenses} sectionKey="operatingExpenses" intlLocale={intlLocale} />
        {report.sections.otherIncome.items.length > 0 && (
          <PLSection section={report.sections.otherIncome} sectionKey="otherIncome" isPositive intlLocale={intlLocale} />
        )}
        {report.sections.otherExpenses.items.length > 0 && (
          <PLSection section={report.sections.otherExpenses} sectionKey="otherExpenses" intlLocale={intlLocale} />
        )}
      </div>
    </div>
  );
}

function PLSection({
  section,
  sectionKey,
  isPositive,
  intlLocale,
}: {
  section: ReportSection;
  sectionKey: string;
  isPositive?: boolean;
  intlLocale: string;
}) {
  const t = useTranslations('reports.plSections');
  const translateCategory = useTranslateCategory();
  const [expanded, setExpanded] = useState(true);

  if (section.items.length === 0 && section.subtotal.amount === 0) {
    return null;
  }

  // Format currency with locale
  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Get translated section name
  const sectionName = t(sectionKey);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4"
      >
        <span className="font-medium text-foreground">{sectionName}</span>
        <div className="flex items-center gap-4">
          <span className={cn('font-medium', isPositive ? 'text-success-600' : 'text-danger-600')}>
            {formatCurrencyLocal(section.subtotal.amount, section.subtotal.currency)}
          </span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>
      {expanded && section.items.length > 0 && (
        <div className="border-t border-border">
          {section.items.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-center justify-between px-4 py-2 text-sm',
                item.isSubtotal && 'bg-muted/50 font-medium'
              )}
            >
              <span className="text-muted-foreground">{translateCategory(item.accountName)}</span>
              <span
                className={cn(
                  isPositive ? 'text-success-600' : 'text-danger-600',
                  item.isSubtotal && 'font-medium'
                )}
              >
                {formatCurrencyLocal(item.amount.amount, item.amount.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Balance Sheet Report View
function BalanceSheetReportView({ report, intlLocale }: { report: BalanceSheetReport; intlLocale: string }) {
  const t = useTranslations('reports');
  const tCommon = useTranslations('common');

  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number, decimals = 2) => {
    return new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  // Helper to format MoneyValue with fallback to pre-formatted string
  const formatMoneyValue = (value: MoneyValue) => {
    if (typeof value.amount === 'number' && value.amount !== 0) {
      return formatCurrencyLocal(value.amount, value.currency);
    }
    if (value.formatted && !value.formatted.match(/^[€$£¥₹₱₩]?\s*0([.,]0+)?$/)) {
      return value.formatted;
    }
    return formatCurrencyLocal(0, value.currency);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('totalAssets')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {formatMoneyValue(report.summaries.totalAssets)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('totalLiabilities')}</p>
          <p className="mt-1 text-xl font-bold text-danger-600">
            {formatMoneyValue(report.summaries.totalLiabilities)}
          </p>
        </div>
        <div className="rounded-lg border border-success-200 bg-success-50 p-4">
          <p className="text-sm text-success-700">{t('totalEquity')}</p>
          <p className="mt-1 text-xl font-bold text-success-700">
            {formatMoneyValue(report.summaries.totalEquity)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('balanced')}</p>
          <p
            className={cn(
              'mt-1 text-xl font-bold',
              report.summaries.isBalanced ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {report.summaries.isBalanced ? `✓ ${tCommon('yes')}` : `✗ ${tCommon('no')}`}
          </p>
        </div>
      </div>

      {/* Ratios */}
      {report.ratios && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t('currentRatio')}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatNumber(report.ratios.currentRatio ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t('quickRatio')}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatNumber(report.ratios.quickRatio ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t('debtToEquity')}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatNumber(report.ratios.debtToEquity ?? 0)}
            </p>
          </div>
          {report.ratios.workingCapital && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{t('workingCapital')}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {report.ratios.workingCapital.formatted}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BSSection section={report.sections.assets} sectionKey="assets" intlLocale={intlLocale} />
        <div className="space-y-6">
          <BSSection section={report.sections.liabilities} sectionKey="liabilities" isLiability intlLocale={intlLocale} />
          <BSSection section={report.sections.equity} sectionKey="equity" isEquity intlLocale={intlLocale} />
        </div>
      </div>
    </div>
  );
}

function BSSection({
  section,
  sectionKey,
  isLiability,
  isEquity,
  intlLocale,
}: {
  section: BalanceSection;
  sectionKey: string;
  isLiability?: boolean;
  isEquity?: boolean;
  intlLocale: string;
}) {
  const t = useTranslations('reports.bsSections');

  // Map section keys to translation keys
  const subsectionKeyMap: Record<string, string> = {
    currentAssets: 'currentAssets',
    fixedAssets: 'fixedAssets',
    currentLiabilities: 'currentLiabilities',
    longTermLiabilities: 'longTermLiabilities',
    retainedEarnings: 'retainedEarnings',
  };

  // Format currency with locale
  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Get translated section name
  const sectionName = t(sectionKey);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <span className="font-medium text-foreground">{sectionName}</span>
        <span
          className={cn(
            'font-bold',
            isEquity ? 'text-success-600' : isLiability ? 'text-danger-600' : 'text-foreground'
          )}
        >
          {formatCurrencyLocal(section.total.amount, section.total.currency)}
        </span>
      </div>
      <div className="divide-y divide-border">
        {section.subsections.map((sub) => {
          // Try to get translated subsection name
          const subSectionName = subsectionKeyMap[sub.key] ? t(subsectionKeyMap[sub.key]) : sub.name;

          return (
            <div key={sub.key} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{subSectionName}</span>
                <span className="text-sm font-medium text-foreground">
                  {formatCurrencyLocal(sub.subtotal.amount, sub.subtotal.currency)}
                </span>
              </div>
              <div className="space-y-1">
                {sub.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center justify-between text-sm',
                      item.isSubtotal && 'font-medium'
                    )}
                  >
                    <span className="text-muted-foreground">{item.accountName}</span>
                    <span className="text-foreground">
                      {formatCurrencyLocal(item.balance.amount, item.balance.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Forecast Report View
function ForecastReportView({
  report,
  formatCurrency,
  intlLocale,
}: {
  report: ForecastReport;
  formatCurrency: (amount: number, currency: string) => string;
  intlLocale: string;
}) {
  const t = useTranslations('reports');

  const formatNumber = (num: number) => new Intl.NumberFormat(intlLocale).format(num);

  const trendLabels: Record<string, string> = {
    improving: t('improving'),
    declining: t('declining'),
    stable: t('stable'),
  };

  const chartData = report.months.map((m) => ({
    month: m.label,
    Income: m.projectedIncome,
    Expenses: Math.abs(m.projectedExpenses),
    Balance: m.projectedBalance,
    isActual: m.isActual,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('currentBalance')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {formatCurrency(report.currentBalance, report.currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('projectedEndBalance')}</p>
          <p
            className={cn(
              'mt-1 text-xl font-bold',
              report.summary.endingBalance >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {formatCurrency(report.summary.endingBalance, report.currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('confidence')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatNumber(report.overallConfidence)}%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('trend')}</p>
          <div className="mt-1 flex items-center gap-2">
            {report.summary.trend === 'improving' ? (
              <TrendingUp className="h-5 w-5 text-success-600" />
            ) : report.summary.trend === 'declining' ? (
              <TrendingDown className="h-5 w-5 text-danger-600" />
            ) : null}
            <span
              className={cn(
                'text-lg font-semibold',
                report.summary.trend === 'improving'
                  ? 'text-success-600'
                  : report.summary.trend === 'declining'
                    ? 'text-danger-600'
                    : 'text-foreground'
              )}
            >
              {trendLabels[report.summary.trend] || report.summary.trend}
            </span>
          </div>
        </div>
      </div>

      {/* Warning if negative balance predicted */}
      {report.summary.monthsUntilNegative !== null && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
          <div className="flex items-center gap-2 text-warning-700">
            <AlertCircle className="h-5 w-5" />
            <p className="font-medium">{t('cashFlowWarning')}</p>
          </div>
          <p className="mt-1 text-sm text-warning-600">
            {t('balanceNegativeIn', { months: report.summary.monthsUntilNegative })}
          </p>
        </div>
      )}

      {/* Forecast Chart */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 font-medium text-foreground">{t('sixMonthForecast')}</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%" minWidth={200}>
            <AreaChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatNumber(value)} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const labelMap: Record<string, string> = {
                      'Balance': t('balance'),
                      'Income': t('income'),
                      'Expenses': t('expenses'),
                    };
                    return (
                      <div className="rounded-lg border border-border bg-card p-2 shadow-lg">
                        <p className="font-medium text-foreground mb-1">{label}</p>
                        {payload.map((entry, index) => (
                          <p key={index} style={{ color: entry.color }} className="text-sm">
                            {labelMap[entry.dataKey as string] || entry.dataKey}: {formatCurrency(entry.value as number, report.currency)}
                          </p>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="Balance"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
              />
              <Line type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line
                type="monotone"
                dataKey="Expenses"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-medium text-foreground">{t('monthlyProjections')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-start font-medium text-muted-foreground">{t('month')}</th>
                <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('income')}</th>
                <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('expenses')}</th>
                <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('net')}</th>
                <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('balance')}</th>
                <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                  {t('confidence')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.months.map((m) => (
                <tr key={m.month} className={m.isActual ? 'bg-muted/30' : ''}>
                  <td className="px-4 py-2 text-foreground">
                    {m.label}
                    {m.isActual && (
                      <span className="ms-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        {t('actual')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-end text-success-600">
                    {formatCurrency(m.projectedIncome, report.currency)}
                  </td>
                  <td className="px-4 py-2 text-end text-danger-600">
                    {formatCurrency(Math.abs(m.projectedExpenses), report.currency)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2 text-end',
                      m.netCashflow >= 0 ? 'text-success-600' : 'text-danger-600'
                    )}
                  >
                    {formatCurrency(m.netCashflow, report.currency)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2 text-end font-medium',
                      m.projectedBalance >= 0 ? 'text-foreground' : 'text-danger-600'
                    )}
                  >
                    {formatCurrency(m.projectedBalance, report.currency)}
                  </td>
                  <td className="px-4 py-2 text-end text-muted-foreground">{m.confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      {report.summary.insights.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 font-medium text-foreground">{t('aiInsights')}</h3>
          <ul className="space-y-2">
            {report.summary.insights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recurring Items */}
      <div className="grid gap-6 lg:grid-cols-2">
        {report.recurring.income.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h3 className="font-medium text-foreground">{t('recurringIncome')}</h3>
            </div>
            <div className="divide-y divide-border">
              {report.recurring.income.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{item.frequency}</p>
                  </div>
                  <p className="font-medium text-success-600">
                    {formatCurrency(item.monthlyAmount, report.currency)}{t('perMo')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.recurring.expenses.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h3 className="font-medium text-foreground">{t('recurringExpenses')}</h3>
            </div>
            <div className="divide-y divide-border">
              {report.recurring.expenses.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{item.frequency}</p>
                  </div>
                  <p className="font-medium text-danger-600">
                    {formatCurrency(item.monthlyAmount, report.currency)}{t('perMo')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Aged Receivables Report View
function AgedReceivablesReportView({ report, intlLocale }: { report: AgedReceivablesReport; intlLocale: string }) {
  const t = useTranslations('reports');

  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number, decimals = 1) => {
    return new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('totalOutstanding')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {formatCurrencyLocal(report.totalOutstanding.amount, report.totalOutstanding.currency)}
          </p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-4',
            report.totalOverdue.amount > 0
              ? 'border-danger-200 bg-danger-50'
              : 'border-border bg-card'
          )}
        >
          <p
            className={cn(
              'text-sm',
              report.totalOverdue.amount > 0 ? 'text-danger-700' : 'text-muted-foreground'
            )}
          >
            {t('totalOverdue')}
          </p>
          <p
            className={cn(
              'mt-1 text-xl font-bold',
              report.totalOverdue.amount > 0 ? 'text-danger-700' : 'text-foreground'
            )}
          >
            {formatCurrencyLocal(report.totalOverdue.amount, report.totalOverdue.currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('overduePercent')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {formatNumber(report.overduePercentage)}%
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('avgDaysOutstanding')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {formatNumber(Math.round(report.averageDaysOutstanding), 0)} {t('days')}
          </p>
        </div>
      </div>

      {/* Bucket Summary */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-medium text-foreground">{t('agingBuckets')}</h3>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-5 md:divide-y-0">
          {(report.buckets || []).map((bucket) => {
            // bucket can be a string or an object with {label, minDays, maxDays}
            const bucketLabel =
              typeof bucket === 'string' ? bucket : bucket?.label || String(bucket);
            const value = report.bucketSummary[bucketLabel];
            const isOverdue = bucketLabel.includes('Overdue') || bucketLabel.includes('+');
            return (
              <div key={bucketLabel} className="p-4 text-center">
                <p className="text-sm text-muted-foreground">{bucketLabel}</p>
                <p
                  className={cn(
                    'mt-1 text-lg font-semibold',
                    isOverdue && value?.amount > 0 ? 'text-danger-600' : 'text-foreground'
                  )}
                >
                  {value?.formatted || '$0.00'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* By Counterparty */}
      {report.byCounterparty.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="font-medium text-foreground">{t('byCustomer')}</h3>
          </div>
          <div className="divide-y divide-border">
            {report.byCounterparty.map((cp) => (
              <div key={cp.counterpartyId} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium text-foreground">{cp.counterpartyName}</span>
                  <span className="font-medium text-foreground">
                    {cp.totalOutstanding.formatted}
                  </span>
                </div>
                <div className="space-y-2">
                  {cp.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm text-muted-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <span>{item.documentNumber}</span>
                        <span className="text-xs">
                          {t('due')}: {new Date(item.dueDate).toLocaleDateString()}
                        </span>
                        {item.daysOverdue > 0 && (
                          <span className="rounded bg-danger-100 px-1.5 py-0.5 text-xs text-danger-700">
                            {t('daysOverdue', { count: item.daysOverdue })}
                          </span>
                        )}
                      </div>
                      <span className={item.daysOverdue > 0 ? 'text-danger-600' : ''}>
                        {item.outstandingAmount.formatted}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.byCounterparty.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
          <Clock className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium text-foreground">{t('noOutstandingReceivables')}</p>
          <p className="text-sm text-muted-foreground">{t('allInvoicesPaid')}</p>
        </div>
      )}
    </div>
  );
}

// VAT Report View
function VatReportView({ report, intlLocale }: { report: VatReport; intlLocale: string }) {
  const t = useTranslations('reports');

  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-success-200 bg-success-50 p-4">
          <p className="text-sm text-success-700">{t('vatCollected')}</p>
          <p className="mt-1 text-2xl font-bold text-success-700">
            {formatCurrencyLocal(report.vatCollected.amount, report.vatCollected.currency)}
          </p>
        </div>
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-4">
          <p className="text-sm text-danger-700">{t('vatPaid')}</p>
          <p className="mt-1 text-2xl font-bold text-danger-700">
            {formatCurrencyLocal(report.vatPaid.amount, report.vatPaid.currency)}
          </p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-4',
            report.netVat.isRefund
              ? 'border-success-200 bg-success-50'
              : 'border-primary/20 bg-primary/5'
          )}
        >
          <p
            className={cn('text-sm', report.netVat.isRefund ? 'text-success-700' : 'text-primary')}
          >
            {report.netVat.isRefund ? t('vatRefundDue') : t('vatPayable')}
          </p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              report.netVat.isRefund ? 'text-success-700' : 'text-primary'
            )}
          >
            {formatCurrencyLocal(report.netVat.amount, report.netVat.currency)}
          </p>
        </div>
      </div>

      {/* By Rate Breakdown */}
      {report.byRate.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="font-medium text-foreground">{t('vatByRate')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-start font-medium text-muted-foreground">{t('rate')}</th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                    {t('collected')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('paid')}</th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('net')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.byRate.map((rate) => {
                  const net = rate.collected.amount - rate.paid.amount;
                  return (
                    <tr key={rate.rate}>
                      <td className="px-4 py-2 text-foreground">{rate.rateLabel}</td>
                      <td className="px-4 py-2 text-end text-success-600">
                        {rate.collected.formatted}
                      </td>
                      <td className="px-4 py-2 text-end text-danger-600">
                        {rate.paid.formatted}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2 text-end font-medium',
                          net >= 0 ? 'text-foreground' : 'text-success-600'
                        )}
                      >
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: report.baseCurrency,
                        }).format(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VAT Entries */}
      {report.entries.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="font-medium text-foreground">{t('vatTransactions')}</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-border bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-start font-medium text-muted-foreground">{t('date')}</th>
                  <th className="px-4 py-2 text-start font-medium text-muted-foreground">{t('invoice')}</th>
                  <th className="px-4 py-2 text-start font-medium text-muted-foreground">
                    {t('merchant')}
                  </th>
                  <th className="px-4 py-2 text-start font-medium text-muted-foreground">{t('type')}</th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('rate')}</th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">{t('vat')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.entries.map((entry) => (
                  <tr key={entry.invoiceId}>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(entry.issueDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-foreground">{entry.invoiceNumber}</td>
                    <td className="px-4 py-2 text-muted-foreground">{entry.merchantName}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs',
                          entry.type === 'output'
                            ? 'bg-success-100 text-success-700'
                            : 'bg-danger-100 text-danger-700'
                        )}
                      >
                        {entry.type === 'output' ? t('output') : t('input')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-end text-muted-foreground">
                      {entry.vatRateLabel}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-end font-medium',
                        entry.type === 'output' ? 'text-success-600' : 'text-danger-600'
                      )}
                    >
                      {entry.vatAmount.formatted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.entries.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
          <Receipt className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium text-foreground">{t('noVatTransactions')}</p>
          <p className="text-sm text-muted-foreground">
            {t('noVatInvoices')}
          </p>
        </div>
      )}
    </div>
  );
}

// General Ledger Report View
function GeneralLedgerReportView({ report, intlLocale }: { report: GeneralLedgerReport; intlLocale: string }) {
  const t = useTranslations('reports');
  const tCommon = useTranslations('common');
  const translateCategory = useTranslateCategory();
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const formatCurrencyLocal = (amount: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper to format MoneyValue with fallback to pre-formatted string
  const formatMoneyValue = (value: MoneyValue) => {
    if (typeof value.amount === 'number' && value.amount !== 0) {
      return formatCurrencyLocal(value.amount, value.currency);
    }
    if (value.formatted && !value.formatted.match(/^[€$£¥₹₱₩]?\s*0([.,]0+)?$/)) {
      return value.formatted;
    }
    return formatCurrencyLocal(0, value.currency);
  };

  const formatNumber = (num: number) => new Intl.NumberFormat(intlLocale).format(num);

  // Format date with locale
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(intlLocale);
  };

  const toggleAccount = (accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  // Account type translations and colors
  const accountTypeMap: Record<string, { key: string; bg: string; text: string }> = {
    ASSET: { key: 'asset', bg: 'bg-blue-100', text: 'text-blue-700' },
    LIABILITY: { key: 'liability', bg: 'bg-danger-100', text: 'text-danger-700' },
    EQUITY: { key: 'equity', bg: 'bg-success-100', text: 'text-success-700' },
    INCOME: { key: 'income', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    EXPENSE: { key: 'expense', bg: 'bg-orange-100', text: 'text-orange-700' },
  };

  // Translate account type
  const translateAccountType = (type: string) => {
    const typeInfo = accountTypeMap[type];
    if (typeInfo) {
      try {
        return tCommon(typeInfo.key);
      } catch {
        return type;
      }
    }
    return type;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('totalDebits')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {formatMoneyValue(report.summary.totalDebits)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('totalCredits')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {formatMoneyValue(report.summary.totalCredits)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('accounts')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatNumber(report.summary.accountCount)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('journalEntries')}</p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatNumber(report.summary.entryCount)}</p>
        </div>
      </div>

      {/* Account List */}
      {report.accounts.length > 0 ? (
        <div className="space-y-4">
          {report.accounts.map((account) => {
            const isExpanded = expandedAccounts.has(account.accountId);
            const typeColor = accountTypeMap[account.accountType] || {
              bg: 'bg-muted',
              text: 'text-foreground',
            };

            return (
              <div key={account.accountId} className="rounded-lg border border-border bg-card">
                {/* Account Header */}
                <button
                  onClick={() => toggleAccount(account.accountId)}
                  className="flex w-full items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                    />
                    <span className="font-mono text-sm text-muted-foreground">
                      {account.accountCode}
                    </span>
                    <span className="font-medium text-foreground">{translateCategory(account.accountName)}</span>
                    <span
                      className={cn('rounded px-2 py-0.5 text-xs', typeColor.bg, typeColor.text)}
                    >
                      {translateAccountType(account.accountType)}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('opening')}: </span>
                      <span className="font-medium text-foreground">
                        {formatMoneyValue(account.openingBalance)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('closing')}: </span>
                      <span className="font-medium text-foreground">
                        {formatMoneyValue(account.closingBalance)}
                      </span>
                    </div>
                    <span className="text-muted-foreground">{account.entries.length} {t('entries')}</span>
                  </div>
                </button>

                {/* Account Entries */}
                {isExpanded && account.entries.length > 0 && (
                  <div className="border-t border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-start font-medium text-muted-foreground">
                              {t('date')}
                            </th>
                            <th className="px-4 py-2 text-start font-medium text-muted-foreground">
                              {t('entryNumber')}
                            </th>
                            <th className="px-4 py-2 text-start font-medium text-muted-foreground">
                              {t('transactions')}
                            </th>
                            <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                              {t('debit')}
                            </th>
                            <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                              {t('credit')}
                            </th>
                            <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                              {t('balance')}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {/* Opening Balance Row */}
                          <tr className="bg-muted/30">
                            <td className="px-4 py-2 text-muted-foreground" colSpan={5}>
                              {t('openingBalance')}
                            </td>
                            <td className="px-4 py-2 text-end font-medium text-foreground">
                              {formatMoneyValue(account.openingBalance)}
                            </td>
                          </tr>

                          {/* Entry Rows */}
                          {account.entries.map((entry) => (
                            <tr key={entry.entryId} className="hover:bg-muted/20">
                              <td className="px-4 py-2 text-muted-foreground">
                                {formatDate(entry.entryDate)}
                              </td>
                              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                {entry.entryNumber}
                              </td>
                              <td className="max-w-xs truncate px-4 py-2 text-foreground">
                                {entry.description}
                              </td>
                              <td className="px-4 py-2 text-end">
                                {entry.debit.amount > 0 ? (
                                  <span className="text-foreground">{formatMoneyValue(entry.debit)}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-end">
                                {entry.credit.amount > 0 ? (
                                  <span className="text-foreground">{formatMoneyValue(entry.credit)}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-end font-medium text-foreground">
                                {formatMoneyValue(entry.runningBalance)}
                              </td>
                            </tr>
                          ))}

                          {/* Closing Balance Row */}
                          <tr className="bg-muted/30">
                            <td className="px-4 py-2 font-medium text-foreground" colSpan={3}>
                              {t('closingBalance')}
                            </td>
                            <td className="px-4 py-2 text-end font-medium text-foreground">
                              {formatMoneyValue(account.totalDebits)}
                            </td>
                            <td className="px-4 py-2 text-end font-medium text-foreground">
                              {formatMoneyValue(account.totalCredits)}
                            </td>
                            <td className="px-4 py-2 text-end font-bold text-foreground">
                              {formatMoneyValue(account.closingBalance)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* No entries message */}
                {isExpanded && account.entries.length === 0 && (
                  <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">
                    {t('noJournalEntries')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium text-foreground">{t('noGLAccounts')}</p>
          <p className="text-sm text-muted-foreground">
            {t('setupChartOfAccounts')}
          </p>
        </div>
      )}
    </div>
  );
}
