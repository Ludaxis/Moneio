'use client';

/**
 * Dashboard Client Component
 *
 * Handles interactive state (date range) and renders dashboard widgets.
 * Receives initial data from the server component.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  SmartAISummary,
  InsightFeedWidget,
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
  type DateRange,
} from '@/components/dashboard';
import { DashboardSkeleton } from '@/components/dashboard/skeletons';
import { useLocaleFormat } from '@/hooks/use-locale-format';

// In-memory cache to keep dashboard data when navigating away/back
const dashboardCache = new Map<
  string,
  { metrics: DashboardMetricsDto | null; transactions: TransactionSummaryDto[]; dateRange: DateRange }
>();

// Types from app-services (inline to avoid import issues)
interface DashboardMetricsDto {
  period: { startDate: string; endDate: string };
  baseCurrency: string;
  totalIncome: { amount: number; currency: string; formatted: string };
  totalExpenses: { amount: number; currency: string; formatted: string };
  netCashflow: { amount: number; currency: string; formatted: string };
  burnRate: { amount: number; currency: string; formatted: string };
  trend: {
    percentageChange: number;
    direction: 'up' | 'down' | 'stable';
    currentMonth: { amount: number; currency: string };
    previousMonth: { amount: number; currency: string };
  };
  monthlyData: Array<{
    month: string;
    monthLabel: string;
    income: number;
    expenses: number;
    netCashflow: number;
  }>;
}

interface TransactionSummaryDto {
  id: string;
  postedAt: string;
  description: string | null;
  amount: string;
  currency: string;
  categoryName: string | null;
}

interface DashboardClientProps {
  workspaceId: string;
  baseCurrency: string;
  initialMetrics: DashboardMetricsDto | null;
  initialTransactions: TransactionSummaryDto[];
  initialDateRange: { startDate: string; endDate: string };
}

// Map date range label keys to translation namespace
const dateRangeTranslationKeys = ['last7Days', 'last30Days', 'last3Months', 'last6Months', 'last12Months', 'customRange'];

export function DashboardClient({
  workspaceId,
  baseCurrency,
  initialMetrics,
  initialTransactions,
  initialDateRange,
}: DashboardClientProps) {
  const t = useTranslations('navigation');
  const tDashboard = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tDateRange = useTranslations('dashboard.dateRange');
  const { formatCurrency, formatDateWithWeekday } = useLocaleFormat();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Helper to translate date range label
  const getTranslatedDateLabel = (label: string): string => {
    if (dateRangeTranslationKeys.includes(label)) {
      return tDateRange(label);
    }
    return label; // Return as-is if it's a custom date range string
  };

  // Initialize date range from URL or defaults
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const startDate = searchParams.get('startDate') || initialDateRange.startDate;
    const endDate = searchParams.get('endDate') || initialDateRange.endDate;
    return {
      startDate,
      endDate,
      label: 'last6Months', // Use translation key instead of hardcoded text
    };
  });

  // Client-side fetched data (for when date range changes)
  const [metrics, setMetrics] = useState<DashboardMetricsDto | null>(initialMetrics);
  const [transactions, setTransactions] = useState<TransactionSummaryDto[]>(initialTransactions);
  const [loading, setLoading] = useState(!initialMetrics);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHydrated = useMemo(
    () => !!metrics || transactions.length > 0,
    [metrics, transactions.length]
  );
  const cacheKey = useMemo(
    () => `${workspaceId}:${dateRange.startDate}:${dateRange.endDate}`,
    [workspaceId, dateRange.startDate, dateRange.endDate]
  );

  // Fetch data when date range changes (client-side)
  const fetchDashboardData = useCallback(async () => {
    if (!workspaceId) return;

    const cached = dashboardCache.get(cacheKey);
    if (cached) {
      setMetrics(cached.metrics);
      setTransactions(cached.transactions);
      setLoading(false);
      return;
    }

    setIsRefreshing(true);
    if (!hasHydrated) {
      setLoading(true);
    }
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
        const mapped =
          txData.transactions?.map(
            (tx: {
              id: string;
              postedAt: string;
              description: string;
              amount: string;
              currency: string;
              categoryName: string | null;
            }) => ({
              id: tx.id,
              postedAt: tx.postedAt,
              description: tx.description,
              amount: tx.amount,
              currency: tx.currency,
              categoryName: tx.categoryName,
            })
          ) || [];
        setTransactions(mapped);
        dashboardCache.set(cacheKey, { metrics: metricsData, transactions: mapped, dateRange });
      } else {
        dashboardCache.set(cacheKey, { metrics: metricsData, transactions, dateRange });
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      setLoading(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [workspaceId, dateRange, baseCurrency, hasHydrated, cacheKey, transactions]);

  // Handle date range change - update URL and refetch
  const handleDateRangeChange = useCallback(
    (newRange: DateRange) => {
      setDateRange(newRange);

      // Update URL with new date range
      const params = new URLSearchParams(searchParams.toString());
      params.set('startDate', newRange.startDate);
      params.set('endDate', newRange.endDate);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Refetch when date range changes (skip initial render)
  useEffect(() => {
    const urlStartDate = searchParams.get('startDate');
    const urlEndDate = searchParams.get('endDate');

    // Only refetch if URL params differ from initial
    if (
      urlStartDate &&
      urlEndDate &&
      (urlStartDate !== initialDateRange.startDate || urlEndDate !== initialDateRange.endDate)
    ) {
      fetchDashboardData();
    }
  }, [searchParams, fetchDashboardData, initialDateRange]);

  // Load data on first render if nothing was provided from the server
  useEffect(() => {
    if (!initialMetrics) {
      const cached = dashboardCache.get(cacheKey);
      if (cached) {
        setMetrics(cached.metrics);
        setTransactions(cached.transactions);
        setLoading(false);
      } else {
        fetchDashboardData();
      }
    }
  }, [initialMetrics, fetchDashboardData, cacheKey]);

  // Calculate comparison for balance cards
  const getComparison = () => {
    if (!metrics?.trend) return undefined;
    return {
      period: tDashboard('vsLastPeriod'),
      percentage: Math.abs(metrics.trend.percentageChange),
      direction: metrics.trend.direction,
    };
  };

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

  // Initial skeleton (prevent widget flicker)
  if (loading && !hasHydrated) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 relative">
      {/* Header with Date Range Picker */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateWithWeekday(new Date())}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
      </div>
      {isRefreshing && (
        <div className="pointer-events-none absolute end-0 top-0 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-primary" />
          {tCommon('loading')}
        </div>
      )}

      {/* Smart AI Summary - Comprehensive Financial Insights */}
      <SmartAISummary
        workspaceId={workspaceId}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
      />

      {/* Balance Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BalanceCard
          type="cash"
          label={tDashboard('cashBalance')}
          value={formatCurrency(metrics?.netCashflow.amount || 0, baseCurrency)}
          lastUpdated={tDashboard('updatedJustNow')}
          comparison={getComparison()}
          loading={loading}
          delay={0}
        />
        <BalanceCard
          type="bank"
          label={tDashboard('totalIncome')}
          value={formatCurrency(metrics?.totalIncome.amount || 0, baseCurrency)}
          lastUpdated={getTranslatedDateLabel(dateRange.label)}
          loading={loading}
          delay={0.1}
        />
        <BalanceCard
          type="card"
          label={tDashboard('totalExpenses')}
          value={formatCurrency(metrics?.totalExpenses.amount || 0, baseCurrency)}
          lastUpdated={getTranslatedDateLabel(dateRange.label)}
          loading={loading}
          delay={0.2}
        />
        <BalanceCard
          type="savings"
          label={tDashboard('burnRate')}
          value={formatCurrency(metrics?.burnRate.amount || 0, baseCurrency)}
          lastUpdated={tDashboard('monthlyAverage')}
          loading={loading}
          delay={0.3}
        />
      </div>

      {/* Full-width Cash Flow Chart */}
      <CashflowChart
        data={metrics?.monthlyData || []}
        loading={loading}
        baseCurrency={baseCurrency}
      />

      {/* Two Column Layout for Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          <OperatingExpensesChart
            workspaceId={workspaceId}
            currency={baseCurrency}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
          />
          <TopExpensesWidget
            workspaceId={workspaceId}
            currency={baseCurrency}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <ForecastChart workspaceId={workspaceId} months={6} />
          <InsightFeedWidget workspaceId={workspaceId} />
          <RunwayWidget workspaceId={workspaceId} />
          <HealthScoreWidget workspaceId={workspaceId} />
        </div>
      </div>

      {/* Pending Actions - Full Width */}
      <PendingActionsWidget workspaceId={workspaceId} />

      {/* Recent Activity */}
      <RecentActivity
        transactions={transactions.map((tx) => ({
          id: tx.id,
          description: tx.description || 'No description',
          amount: parseFloat(tx.amount),
          currency: tx.currency,
          date: tx.postedAt,
          categoryName: tx.categoryName || undefined,
        }))}
        loading={loading}
      />
    </div>
  );
}
