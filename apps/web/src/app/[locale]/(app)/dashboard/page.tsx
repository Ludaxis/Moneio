'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useCallback } from 'react';

import {
  AIInsightsBanner,
  BalanceCard,
  RunwayWidget,
  CashflowChart,
  TopExpensesWidget,
  PendingActionsWidget,
  OperatingExpensesChart,
  HealthScoreWidget,
  ForecastChart,
  RecentActivity,
  DateRangePicker,
  getDefaultDateRange,
  type DateRange,
} from '@/components/dashboard';
import { useWorkspace } from '@/hooks/use-workspace';

interface DashboardMetrics {
  period: { start: string; end: string };
  baseCurrency: string;
  totalIncome: { amount: number; currency: string; formatted: string };
  totalExpenses: { amount: number; currency: string; formatted: string };
  netCashflow: { amount: number; currency: string; formatted: string };
  burnRate: { amount: number; currency: string; formatted: string };
  trend: {
    currentMonth: { amount: number; currency: string };
    previousMonth: { amount: number; currency: string };
    changePercentage: number;
    direction: 'up' | 'down' | 'stable';
  };
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    type: 'income' | 'expense';
    amount: number;
    currency: string;
    percentage: number;
    transactionCount: number;
  }>;
  monthlyData: Array<{
    month: string;
    monthLabel: string;
    income: number;
    expenses: number;
    netCashflow: number;
  }>;
}

interface Transaction {
  id: string;
  postedAt: string;
  description: string;
  amount: number;
  currency: string;
  categoryName: string | null;
}

export default function DashboardPage() {
  const t = useTranslations('navigation');
  const { workspaceId, baseCurrency, loading: workspaceLoading } = useWorkspace();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);

  const fetchDashboardData = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        workspaceId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      if (baseCurrency) params.set('baseCurrency', baseCurrency);

      const [metricsRes, transactionsRes] = await Promise.all([
        fetch(`/api/dashboard/metrics?${params.toString()}`),
        fetch(`/api/transactions?workspaceId=${workspaceId}&pageSize=5`),
      ]);

      if (!metricsRes.ok) {
        throw new Error('Failed to fetch dashboard metrics');
      }

      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      if (transactionsRes.ok) {
        const txData = await transactionsRes.json();
        setTransactions(txData.transactions || []);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, dateRange, baseCurrency]);

  useEffect(() => {
    if (workspaceId) {
      fetchDashboardData();
    }
  }, [workspaceId, fetchDashboardData]);

  const isLoading = workspaceLoading || loading;

  // Format currency helper
  const formatCurrency = (amount: number, currency: string = baseCurrency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate comparison for balance cards
  const getComparison = () => {
    if (!metrics?.trend) return undefined;
    return {
      period: 'vs last period',
      percentage: Math.abs(metrics.trend.changePercentage),
      direction: metrics.trend.direction,
    };
  };

  // Show message if no workspace
  if (!workspaceLoading && !workspaceId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>
        <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-muted-foreground">
            Create a workspace to get started with your AI-powered financial dashboard.
          </p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>
        <div className="rounded-xl border border-destructive bg-destructive/10 p-6 shadow-sm">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Range Picker */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* AI Insights Banner */}
      {workspaceId && <AIInsightsBanner workspaceId={workspaceId} />}

      {/* Balance Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BalanceCard
          type="cash"
          label="Cash Balance"
          value={metrics?.netCashflow.formatted || formatCurrency(0, baseCurrency)}
          lastUpdated="Updated just now"
          comparison={getComparison()}
          loading={isLoading}
          delay={0}
        />
        <BalanceCard
          type="bank"
          label="Total Income"
          value={metrics?.totalIncome.formatted || formatCurrency(0, baseCurrency)}
          lastUpdated={dateRange.label}
          loading={isLoading}
          delay={0.1}
        />
        <BalanceCard
          type="card"
          label="Total Expenses"
          value={metrics?.totalExpenses.formatted || formatCurrency(0, baseCurrency)}
          lastUpdated={dateRange.label}
          loading={isLoading}
          delay={0.2}
        />
        <BalanceCard
          type="savings"
          label="Burn Rate"
          value={metrics?.burnRate.formatted || formatCurrency(0, baseCurrency)}
          lastUpdated="Monthly average"
          loading={isLoading}
          delay={0.3}
        />
      </div>

      {/* Full-width Cash Flow Chart */}
      <CashflowChart
        data={metrics?.monthlyData || []}
        loading={isLoading}
        baseCurrency={baseCurrency}
      />

      {/* Two Column Layout for Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Operating Expenses */}
          {workspaceId && (
            <OperatingExpensesChart
              workspaceId={workspaceId}
              currency={baseCurrency}
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
            />
          )}

          {/* Top Expenses */}
          {workspaceId && (
            <TopExpensesWidget
              workspaceId={workspaceId}
              currency={baseCurrency}
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
            />
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Forecast Chart */}
          {workspaceId && <ForecastChart workspaceId={workspaceId} months={6} />}

          {/* Runway Widget */}
          {workspaceId && <RunwayWidget workspaceId={workspaceId} />}

          {/* Health Score */}
          {workspaceId && <HealthScoreWidget workspaceId={workspaceId} />}
        </div>
      </div>

      {/* Pending Actions - Full Width */}
      {workspaceId && <PendingActionsWidget workspaceId={workspaceId} />}

      {/* Recent Activity */}
      <RecentActivity
        transactions={transactions.map((tx) => ({
          id: tx.id,
          description: tx.description || 'No description',
          amount: tx.amount,
          currency: tx.currency,
          date: tx.postedAt,
          categoryName: tx.categoryName || undefined,
        }))}
        loading={isLoading}
      />
    </div>
  );
}
