'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useCallback } from 'react';

import { StatCard, CashflowChart, CategoryBreakdown, RecentActivity } from '@/components/dashboard';
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
  const tReports = useTranslations('reports');
  const { workspaceId, baseCurrency, loading: workspaceLoading } = useWorkspace();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch metrics and transactions in parallel
      const [metricsRes, transactionsRes] = await Promise.all([
        fetch(`/api/dashboard/metrics?workspaceId=${workspaceId}&period=month`),
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
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchDashboardData();
    }
  }, [workspaceId, fetchDashboardData]);

  const isLoading = workspaceLoading || loading;

  // Show message if no workspace
  if (!workspaceLoading && !workspaceId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            Create a workspace to get started with your accounting dashboard.
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
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
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
      <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={tReports('income')}
          value={metrics?.totalIncome.formatted || '€0'}
          loading={isLoading}
        />
        <StatCard
          label={tReports('expenses')}
          value={metrics?.totalExpenses.formatted || '€0'}
          loading={isLoading}
        />
        <StatCard
          label={tReports('profit')}
          value={metrics?.netCashflow.formatted || '€0'}
          trend={
            metrics?.trend
              ? {
                  direction: metrics.trend.direction,
                  percentage: metrics.trend.changePercentage,
                }
              : undefined
          }
          loading={isLoading}
        />
        <StatCard
          label="Burn Rate"
          value={metrics?.burnRate.formatted || '€0'}
          loading={isLoading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CashflowChart
          data={metrics?.monthlyData || []}
          loading={isLoading}
          baseCurrency={baseCurrency}
        />
        <CategoryBreakdown
          data={metrics?.categoryBreakdown || []}
          loading={isLoading}
          baseCurrency={baseCurrency}
        />
      </div>

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
