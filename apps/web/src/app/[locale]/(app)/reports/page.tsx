'use client';

import { cn } from '@moneio/ui';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChevronDown,
  DollarSign,
  FileText,
  Heart,
  Loader2,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
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
} from 'recharts';

import { useWorkspace } from '@/lib/workspace';

type ReportTab = 'cashflow' | 'profit-loss' | 'balance-sheet';

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
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const workspaceId = workspace?.id;

  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

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
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchCashflow, fetchProfitLoss, fetchBalanceSheet]);

  useEffect(() => {
    if (workspaceId) {
      fetchHealthScore();
      fetchActiveReport();
    }
  }, [workspaceId, fetchHealthScore, fetchActiveReport]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(locale, {
      month: 'short',
      year: '2-digit',
    });
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
        name: c.categoryName || 'Uncategorized',
        value: Math.abs(c.amount),
        percentage: c.percentage,
      }));
  }, [cashflowReport]);

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
        <p className="text-muted-foreground">Select or create a workspace to view reports</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comprehensive financial analysis and insights
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
            Refresh
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
              <span className="text-sm font-medium">Financial Health Score</span>
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
                <p className="text-3xl font-bold text-foreground">{healthScore.overallScore}/100</p>
                <p className="text-sm text-muted-foreground capitalize">{healthScore.rating}</p>
                <p className="mt-1 text-xs text-muted-foreground">{healthScore.summary}</p>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Avg Monthly Income</span>
            </div>
            <p className="mt-2 text-xl font-bold text-success-600">
              {formatCurrency(healthScore.data.avgMonthlyIncome, healthScore.currency)}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm">Avg Monthly Expenses</span>
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
          <span className="text-sm font-medium text-foreground">Report Period</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-muted-foreground">to</span>
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
            This Month
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
            YTD
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
            Last 12 Months
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
              Cash Flow
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
              Profit &amp; Loss
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
              Balance Sheet
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
            Try again
          </button>
        </div>
      ) : activeTab === 'cashflow' && cashflowReport ? (
        <CashflowReportView
          report={cashflowReport}
          chartData={cashflowChartData}
          pieData={categoryPieData}
        />
      ) : activeTab === 'profit-loss' && profitLossReport ? (
        <ProfitLossReportView report={profitLossReport} />
      ) : activeTab === 'balance-sheet' && balanceSheetReport ? (
        <BalanceSheetReportView report={balanceSheetReport} />
      ) : (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
          <BarChart3 className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium text-foreground">No data available</p>
          <p className="text-sm text-muted-foreground">Import transactions to generate reports</p>
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
}: {
  report: CashflowReport;
  chartData: Array<Record<string, string | number>>;
  pieData: Array<{ name: string; value: number; percentage: number }>;
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-success-200 bg-success-50 p-4">
          <div className="flex items-center gap-2 text-success-700">
            <ArrowUpRight className="h-4 w-4" />
            <span className="text-sm">Total Income</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-success-700">{report.income.formatted}</p>
        </div>

        <div className="rounded-lg border border-danger-200 bg-danger-50 p-4">
          <div className="flex items-center gap-2 text-danger-700">
            <ArrowDownRight className="h-4 w-4" />
            <span className="text-sm">Total Expenses</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-danger-700">{report.expenses.formatted}</p>
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
            <span className="text-sm">Net Cash Flow</span>
          </div>
          <p
            className={cn(
              'mt-2 text-2xl font-bold',
              report.netCashflow.amount >= 0 ? 'text-success-700' : 'text-danger-700'
            )}
          >
            {report.netCashflow.formatted}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend Chart */}
        {chartData.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-4 font-medium text-foreground">Monthly Cash Flow</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={200}>
                <BarChart data={chartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
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
            <h3 className="mb-4 font-medium text-foreground">Expense Breakdown</h3>
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
                    label={({ name, payload }) => `${name} (${payload?.percentage ?? 0}%)`}
                    labelLine={false}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Category Details */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-medium text-foreground">Category Details</h3>
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
                    {cat.categoryName || 'Uncategorized'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {cat.transactionCount} transactions
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    'font-medium',
                    cat.type === 'income' ? 'text-success-600' : 'text-danger-600'
                  )}
                >
                  {cat.formatted}
                </p>
                <p className="text-xs text-muted-foreground">{cat.percentage}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Profit & Loss Report View
function ProfitLossReportView({ report }: { report: ProfitLossReport }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Gross Profit</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              report.summaries.grossProfit.amount >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {report.summaries.grossProfit.formatted}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Operating Income</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              report.summaries.operatingIncome.amount >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {report.summaries.operatingIncome.formatted}
          </p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-4',
            report.summaries.netIncome.amount >= 0
              ? 'border-success-200 bg-success-50'
              : 'border-danger-200 bg-danger-50'
          )}
        >
          <p
            className={cn(
              'text-sm',
              report.summaries.netIncome.amount >= 0 ? 'text-success-700' : 'text-danger-700'
            )}
          >
            Net Income
          </p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              report.summaries.netIncome.amount >= 0 ? 'text-success-700' : 'text-danger-700'
            )}
          >
            {report.summaries.netIncome.formatted}
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <PLSection section={report.sections.revenue} isPositive />
        <PLSection section={report.sections.costOfGoodsSold} />
        <PLSection section={report.sections.operatingExpenses} />
        {report.sections.otherIncome.items.length > 0 && (
          <PLSection section={report.sections.otherIncome} isPositive />
        )}
        {report.sections.otherExpenses.items.length > 0 && (
          <PLSection section={report.sections.otherExpenses} />
        )}
      </div>
    </div>
  );
}

function PLSection({ section, isPositive }: { section: ReportSection; isPositive?: boolean }) {
  const [expanded, setExpanded] = useState(true);

  if (section.items.length === 0 && section.subtotal.amount === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4"
      >
        <span className="font-medium text-foreground">{section.name}</span>
        <div className="flex items-center gap-4">
          <span className={cn('font-medium', isPositive ? 'text-success-600' : 'text-danger-600')}>
            {section.subtotal.formatted}
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
              <span className="text-muted-foreground">{item.accountName}</span>
              <span
                className={cn(
                  isPositive ? 'text-success-600' : 'text-danger-600',
                  item.isSubtotal && 'font-medium'
                )}
              >
                {item.amount.formatted}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Balance Sheet Report View
function BalanceSheetReportView({ report }: { report: BalanceSheetReport }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Assets</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {report.summaries.totalAssets.formatted}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Liabilities</p>
          <p className="mt-1 text-xl font-bold text-danger-600">
            {report.summaries.totalLiabilities.formatted}
          </p>
        </div>
        <div className="rounded-lg border border-success-200 bg-success-50 p-4">
          <p className="text-sm text-success-700">Total Equity</p>
          <p className="mt-1 text-xl font-bold text-success-700">
            {report.summaries.totalEquity.formatted}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Balanced</p>
          <p
            className={cn(
              'mt-1 text-xl font-bold',
              report.summaries.isBalanced ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {report.summaries.isBalanced ? '✓ Yes' : '✗ No'}
          </p>
        </div>
      </div>

      {/* Ratios */}
      {report.ratios && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Current Ratio</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {report.ratios.currentRatio.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Quick Ratio</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {report.ratios.quickRatio.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Debt to Equity</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {report.ratios.debtToEquity.toFixed(2)}
            </p>
          </div>
          {report.ratios.workingCapital && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Working Capital</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {report.ratios.workingCapital.formatted}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BSSection section={report.sections.assets} />
        <div className="space-y-6">
          <BSSection section={report.sections.liabilities} isLiability />
          <BSSection section={report.sections.equity} isEquity />
        </div>
      </div>
    </div>
  );
}

function BSSection({
  section,
  isLiability,
  isEquity,
}: {
  section: BalanceSection;
  isLiability?: boolean;
  isEquity?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <span className="font-medium text-foreground">{section.name}</span>
        <span
          className={cn(
            'font-bold',
            isEquity ? 'text-success-600' : isLiability ? 'text-danger-600' : 'text-foreground'
          )}
        >
          {section.total.formatted}
        </span>
      </div>
      <div className="divide-y divide-border">
        {section.subsections.map((sub) => (
          <div key={sub.key} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{sub.name}</span>
              <span className="text-sm font-medium text-foreground">{sub.subtotal.formatted}</span>
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
                  <span className="text-foreground">{item.balance.formatted}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
