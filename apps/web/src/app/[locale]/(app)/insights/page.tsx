'use client';

import { cn } from '@moneio/ui';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  Eye,
  Info,
  Lightbulb,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { useLocaleFormat } from '@/hooks/use-locale-format';
import { useWorkspace } from '@/lib/workspace';

interface Insight {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'alert' | 'positive';
  title: string;
  message: string;
  data: Record<string, unknown>;
  actionUrl: string | null;
  actionLabel: string | null;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  expiresAt: string | null;
}

interface InsightsSummary {
  total: number;
  unread: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}

interface InsightsPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface WeeklyDigest {
  period: { start: string; end: string };
  summary: {
    totalIncome: string;
    totalExpenses: string;
    netCashflow: string;
    transactionCount: number;
    comparedToLastWeek: {
      incomeChange: string;
      expensesChange: string;
      netChange: string;
    };
  };
  highlights: Array<{ type: string; message: string }>;
  actionItems: Array<{ title: string; url: string; priority: string }>;
  forecast: {
    nextWeekProjection: string;
    cashflowStatus: string;
    projectionBasis: string;
  };
  currency: string;
  generatedAt: string;
}

const severityConfig: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode; border: string; badge: string }
> = {
  alert: {
    bg: 'bg-danger-50',
    text: 'text-danger-700',
    icon: <AlertCircle className="h-5 w-5" />,
    border: 'border-danger-200',
    badge: 'bg-danger-100 text-danger-700',
  },
  warning: {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    icon: <AlertTriangle className="h-5 w-5" />,
    border: 'border-warning-200',
    badge: 'bg-warning-100 text-warning-700',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    icon: <Info className="h-5 w-5" />,
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
  positive: {
    bg: 'bg-success-50',
    text: 'text-success-700',
    icon: <TrendingUp className="h-5 w-5" />,
    border: 'border-success-200',
    badge: 'bg-success-100 text-success-700',
  },
};

// Type keys for translation
const typeKeys = [
  'anomaly_spending',
  'anomaly_income',
  'subscription_change',
  'new_recurring',
  'budget_warning',
  'cash_flow_warning',
  'invoice_overdue',
  'payment_received',
  'tax_deadline',
  'savings_opportunity',
  'benchmark_comparison',
  'goal_progress',
];

export default function InsightsPage() {
  const t = useTranslations('insights');
  const tTypes = useTranslations('insights.types');
  const tStatuses = useTranslations('insights.forecastStatuses');
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const workspaceId = workspace?.id;
  const { intlLocale } = useLocaleFormat();

  const [insights, setInsights] = useState<Insight[]>([]);
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [pagination, setPagination] = useState<InsightsPagination | null>(null);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [digestLoading, setDigestLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'dismissed'>('all');
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showDigest, setShowDigest] = useState(true);

  const fetchInsights = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        workspaceId,
        filter: filterStatus,
        limit: '50',
      });

      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterType) params.set('type', filterType);

      const response = await fetch(`/api/insights?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }

      const data = await response.json();
      setInsights(data.insights || []);
      setSummary(data.summary || null);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filterStatus, filterSeverity, filterType]);

  const fetchDigest = useCallback(async () => {
    if (!workspaceId) return;

    setDigestLoading(true);

    try {
      const response = await fetch(`/api/insights/digest?workspaceId=${workspaceId}`);

      if (!response.ok) {
        console.warn('Failed to fetch digest');
        return;
      }

      const data = await response.json();
      setDigest(data.digest || null);
    } catch (err) {
      console.warn('Failed to fetch digest:', err);
    } finally {
      setDigestLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchInsights();
      fetchDigest();
    }
  }, [workspaceId, fetchInsights, fetchDigest]);

  // Filter insights by search query
  const filteredInsights = useMemo(() => {
    if (!searchQuery) return insights;

    const query = searchQuery.toLowerCase();
    return insights.filter(
      (i) =>
        i.title.toLowerCase().includes(query) ||
        i.message.toLowerCase().includes(query) ||
        i.type.toLowerCase().includes(query)
    );
  }, [insights, searchQuery]);

  const handleMarkAsRead = async (insightId: string) => {
    try {
      await fetch(`/api/insights/${insightId}/read`, { method: 'POST' });
      setInsights((prev) =>
        prev.map((i) => (i.id === insightId ? { ...i, readAt: new Date().toISOString() } : i))
      );
      setSummary((prev) => (prev ? { ...prev, unread: Math.max(0, prev.unread - 1) } : prev));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleDismiss = async (insightId: string) => {
    try {
      await fetch(`/api/insights/${insightId}/dismiss`, { method: 'POST' });
      setInsights((prev) => prev.filter((i) => i.id !== insightId));
      setSummary((prev) =>
        prev ? { ...prev, total: prev.total - 1, unread: Math.max(0, prev.unread - 1) } : prev
      );
    } catch (err) {
      console.error('Failed to dismiss:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadInsights = insights.filter((i) => !i.readAt);
    await Promise.all(
      unreadInsights.map((i) => fetch(`/api/insights/${i.id}/read`, { method: 'POST' }))
    );
    setInsights((prev) =>
      prev.map((i) => (!i.readAt ? { ...i, readAt: new Date().toISOString() } : i))
    );
    setSummary((prev) => (prev ? { ...prev, unread: 0 } : prev));
  };

  const formatCurrency = (amount: string | number, currency: string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(intlLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 7) return formatDate(dateStr);
    if (days > 0) return t('daysAgo', { days });
    if (hours > 0) return t('hoursAgo', { hours });
    if (minutes > 0) return t('minutesAgo', { minutes });
    return t('justNow');
  };

  // Helper to translate type labels
  const getTypeLabel = (type: string) => {
    try {
      return tTypes(type);
    } catch {
      return type;
    }
  };

  // Helper to translate forecast status
  const getForecastStatus = (status: string) => {
    try {
      return tStatuses(status);
    } catch {
      return status;
    }
  };

  if (workspaceLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Helper to format numbers with locale
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(intlLocale).format(num);
  };

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
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {summary && summary.unread > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Check className="h-4 w-4" />
              {t('markAllAsRead')}
            </button>
          )}
          <button
            onClick={() => {
              fetchInsights();
              fetchDigest();
            }}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lightbulb className="h-4 w-4" />
              <span className="text-sm">{t('totalInsights')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatNumber(summary.total)}</p>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-primary">
              <Bell className="h-4 w-4" />
              <span className="text-sm">{t('unread')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-primary">{formatNumber(summary.unread)}</p>
          </div>

          <div className="rounded-lg border border-danger-200 bg-danger-50 p-4">
            <div className="flex items-center gap-2 text-danger-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{t('alerts')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-danger-700">
              {formatNumber(summary.bySeverity?.alert || 0)}
            </p>
          </div>

          <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
            <div className="flex items-center gap-2 text-warning-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{t('warnings')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-warning-700">
              {formatNumber(summary.bySeverity?.warning || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Weekly Digest */}
      {showDigest && (
        <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">{t('weeklyDigest')}</h2>
            </div>
            <button
              onClick={() => setShowDigest(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {digestLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : digest ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">{t('netCashflow')}</p>
                <p
                  className={cn(
                    'text-xl font-bold',
                    parseFloat(digest.summary.netCashflow) >= 0
                      ? 'text-success-700'
                      : 'text-danger-700'
                  )}
                >
                  {formatCurrency(digest.summary.netCashflow, digest.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {parseFloat(digest.summary.comparedToLastWeek.netChange) >= 0 ? '+' : ''}
                  {formatNumber(parseFloat(digest.summary.comparedToLastWeek.netChange))}%{' '}
                  {t('vsLastWeek')}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">{t('forecastStatus')}</p>
                <p
                  className={cn(
                    'text-lg font-semibold',
                    digest.forecast.cashflowStatus === 'healthy'
                      ? 'text-success-700'
                      : digest.forecast.cashflowStatus === 'warning'
                        ? 'text-warning-700'
                        : 'text-danger-700'
                  )}
                >
                  {getForecastStatus(digest.forecast.cashflowStatus)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('nextWeek')}{' '}
                  {formatCurrency(digest.forecast.nextWeekProjection, digest.currency)}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">{t('activity')}</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatNumber(digest.summary.transactionCount)} {t('transactions')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(digest.period.start)} - {formatDate(digest.period.end)}
                </p>
              </div>

              {digest.highlights.length > 0 && (
                <div className="md:col-span-3">
                  <p className="text-sm font-medium text-muted-foreground">{t('highlights')}</p>
                  <ul className="mt-2 space-y-1">
                    {digest.highlights.slice(0, 3).map((h, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="text-primary">•</span>
                        <span>{h.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t('noDigestData')}</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('searchInsights')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 ps-9 pe-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="appearance-none rounded-lg border border-border bg-background py-2 ps-3 pe-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">{t('allInsights')}</option>
            <option value="unread">{t('unreadOnly')}</option>
            <option value="dismissed">{t('dismissed')}</option>
          </select>
          <ChevronDown className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filterSeverity || ''}
            onChange={(e) => setFilterSeverity(e.target.value || null)}
            className="appearance-none rounded-lg border border-border bg-background py-2 ps-3 pe-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t('allSeverities')}</option>
            <option value="alert">{t('alerts')}</option>
            <option value="warning">{t('warnings')}</option>
            <option value="info">{t('info')}</option>
            <option value="positive">{t('positive')}</option>
          </select>
          <ChevronDown className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filterType || ''}
            onChange={(e) => setFilterType(e.target.value || null)}
            className="appearance-none rounded-lg border border-border bg-background py-2 ps-3 pe-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t('allTypes')}</option>
            {typeKeys.map((key) => (
              <option key={key} value={key}>
                {getTypeLabel(key)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        {(searchQuery || filterSeverity || filterType || filterStatus !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterStatus('all');
              setFilterSeverity(null);
              setFilterType(null);
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            {t('clearFilters')}
          </button>
        )}
      </div>

      {/* Insights List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-12 w-12 text-danger-500" />
          <p className="text-danger-600">{error}</p>
          <button
            onClick={fetchInsights}
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <RefreshCw className="h-4 w-4" />
            {t('tryAgain')}
          </button>
        </div>
      ) : filteredInsights.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
          <div className="rounded-full bg-success-100 p-3">
            <Check className="h-8 w-8 text-success-600" />
          </div>
          <p className="font-medium text-foreground">
            {insights.length === 0 ? t('noInsightsYet') : t('noInsightsMatch')}
          </p>
          <p className="text-sm text-muted-foreground">
            {insights.length === 0 ? t('willNotify') : t('tryAdjustingFilters')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInsights.map((insight) => {
            const config = severityConfig[insight.severity] || severityConfig.info;
            const isUnread = !insight.readAt;

            return (
              <div
                key={insight.id}
                className={cn(
                  'group rounded-lg border p-4 transition-all',
                  isUnread ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
                  config.bg
                )}
              >
                <div className="flex items-start gap-4">
                  <div className={cn('rounded-full p-2', config.badge)}>{config.icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground">{insight.title}</h3>
                          {isUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{insight.message}</p>
                      </div>

                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isUnread && (
                          <button
                            onClick={() => handleMarkAsRead(insight.id)}
                            className="p-1.5 rounded hover:bg-muted"
                            title={t('markAsRead')}
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDismiss(insight.id)}
                          className="p-1.5 rounded hover:bg-muted"
                          title={t('dismiss')}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn('rounded-full px-2 py-0.5', config.badge)}>
                        {getTypeLabel(insight.type)}
                      </span>
                      <span>•</span>
                      <span>{formatRelativeTime(insight.createdAt)}</span>
                      {insight.actionUrl && (
                        <>
                          <span>•</span>
                          <a href={insight.actionUrl} className="text-primary hover:underline">
                            {insight.actionLabel || t('viewDetails')}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load more */}
          {pagination && pagination.hasMore && (
            <div className="flex justify-center pt-4">
              <button className="flex items-center gap-2 text-sm text-primary hover:underline">
                {t('loadMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
