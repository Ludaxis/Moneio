'use client';

import { cn } from '@moneio/ui';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Calendar,
  ChevronDown,
  CreditCard,
  Loader2,
  PiggyBank,
  RefreshCw,
  Search,
  TrendingDown,
  X,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
// import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { useWorkspace } from '@/lib/workspace';

interface SubscriptionFlag {
  type: string;
  severity: 'info' | 'warning' | 'alert';
  message: string;
  potentialSavings: string | null;
  suggestion: string | null;
}

interface Subscription {
  id: string;
  merchantName: string;
  normalizedName: string;
  amount: string;
  currency: string;
  frequency: string;
  monthlyEquivalent: string;
  category: string | null;
  categoryId: string | null;
  firstSeen: string;
  lastCharge: string;
  chargeCount: number;
  status: string;
  confidence: number;
  flags: SubscriptionFlag[];
  transactionIds: string[];
}

interface MoneyLeak {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  monthlyImpact: string;
  annualImpact: string;
  currency: string;
  recommendation: string;
  status: string;
}

interface SubscriptionSummary {
  totalMonthly: string;
  totalAnnual: string;
  subscriptionCount: number;
  activeCount: number;
  flaggedCount: number;
  potentialSavings: string;
  currency: string;
}

interface MoneyLeaksSummary {
  totalLeaks: number;
  newLeaks: number;
  totalPotentialSavings: string;
  currency: string;
}

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: 'bg-danger-50', text: 'text-danger-700', border: 'border-danger-200' },
  medium: { bg: 'bg-warning-50', text: 'text-warning-700', border: 'border-warning-200' },
  low: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' },
  alert: { bg: 'bg-danger-50', text: 'text-danger-700', border: 'border-danger-200' },
  warning: { bg: 'bg-warning-50', text: 'text-warning-700', border: 'border-warning-200' },
  info: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' },
};

const frequencyLabels: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-success-100 text-success-700' },
  paused: { label: 'Paused', color: 'bg-warning-100 text-warning-700' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
  unknown: { label: 'Unknown', color: 'bg-muted text-muted-foreground' },
};

export default function SubscriptionsPage() {
  const pathname = usePathname();
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const workspaceId = workspace?.id;

  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [leaks, setLeaks] = useState<MoneyLeak[]>([]);
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [leaksSummary, setLeaksSummary] = useState<MoneyLeaksSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'leaks'>('subscriptions');

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const [subResponse, leaksResponse] = await Promise.all([
        fetch(`/api/insights/subscriptions?workspaceId=${workspaceId}`),
        fetch(`/api/insights/money-leaks?workspaceId=${workspaceId}`),
      ]);

      if (!subResponse.ok || !leaksResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const subData = await subResponse.json();
      const leaksData = await leaksResponse.json();

      setSubscriptions(subData.subscriptions || []);
      setSubscriptionSummary(subData.summary || null);
      setLeaks(leaksData.leaks || []);
      setLeaksSummary(leaksData.summary || null);
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchData();
    }
  }, [workspaceId, fetchData]);

  // Filter subscriptions
  const filteredSubscriptions = useMemo(() => {
    let result = subscriptions;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.merchantName.toLowerCase().includes(query) ||
          (s.category && s.category.toLowerCase().includes(query))
      );
    }

    if (statusFilter) {
      result = result.filter((s) => s.status === statusFilter);
    }

    if (showFlaggedOnly) {
      result = result.filter((s) => s.flags.length > 0);
    }

    return result;
  }, [subscriptions, searchQuery, statusFilter, showFlaggedOnly]);

  const formatCurrency = (amount: string | number, currency: string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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
        <p className="text-muted-foreground">Select or create a workspace to view subscriptions</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subscriptions & Money Leaks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track recurring charges and find savings opportunities
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {subscriptionSummary && leaksSummary && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span className="text-sm">Monthly Subscriptions</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatCurrency(subscriptionSummary.totalMonthly, subscriptionSummary.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {subscriptionSummary.activeCount} active of {subscriptionSummary.subscriptionCount} total
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Annual Cost</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatCurrency(subscriptionSummary.totalAnnual, subscriptionSummary.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Projected yearly total</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-warning-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Issues Found</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-warning-700">{leaksSummary.totalLeaks}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {leaksSummary.newLeaks} new, {subscriptionSummary.flaggedCount} flagged
            </p>
          </div>

          <div className="rounded-lg border border-success-200 bg-success-50 p-4">
            <div className="flex items-center gap-2 text-success-600">
              <PiggyBank className="h-4 w-4" />
              <span className="text-sm">Potential Savings</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-success-700">
              {formatCurrency(leaksSummary.totalPotentialSavings, leaksSummary.currency)}
            </p>
            <p className="mt-1 text-xs text-success-600">per year</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'subscriptions'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Subscriptions
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {subscriptions.length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('leaks')}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'leaks'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Money Leaks
              {leaks.length > 0 && (
                <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs text-danger-700">
                  {leaks.length}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-12 w-12 text-danger-500" />
          <p className="text-danger-600">{error}</p>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      ) : activeTab === 'subscriptions' ? (
        <>
          {/* Filters for subscriptions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search subscriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="relative">
              <select
                value={statusFilter || ''}
                onChange={(e) => setStatusFilter(e.target.value || null)}
                className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
                <option value="unknown">Unknown</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            <button
              onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                showFlaggedOnly
                  ? 'border-warning-300 bg-warning-50 text-warning-700'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              <AlertTriangle className="h-4 w-4" />
              Flagged only
            </button>

            {(searchQuery || statusFilter || showFlaggedOnly) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter(null);
                  setShowFlaggedOnly(false);
                }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Clear filters
              </button>
            )}
          </div>

          {/* Subscriptions List */}
          {filteredSubscriptions.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
              <CreditCard className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                {subscriptions.length === 0
                  ? 'No subscriptions detected yet'
                  : 'No subscriptions match your filters'}
              </p>
              {subscriptions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Import more transactions to detect recurring patterns
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubscriptions.map((sub) => {
                const statusInfo = statusLabels[sub.status] || statusLabels.unknown;
                return (
                  <div
                    key={sub.id}
                    className={cn(
                      'rounded-lg border bg-card p-4 transition-shadow hover:shadow-md',
                      sub.flags.length > 0 ? 'border-warning-200' : 'border-border'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Banknote className="h-5 w-5 text-muted-foreground" />
                          <h3 className="font-medium text-foreground truncate">
                            {sub.merchantName}
                          </h3>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              statusInfo.color
                            )}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{frequencyLabels[sub.frequency] || sub.frequency}</span>
                          <span>
                            {formatCurrency(sub.amount, sub.currency)} per charge
                          </span>
                          <span>{sub.chargeCount} charges</span>
                          {sub.category && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                              {sub.category}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          First seen {formatDate(sub.firstSeen)} · Last charge{' '}
                          {formatDate(sub.lastCharge)}
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-bold text-foreground">
                          {formatCurrency(sub.monthlyEquivalent, sub.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">/month</p>
                      </div>
                    </div>

                    {/* Flags */}
                    {sub.flags.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {sub.flags.map((flag, idx) => {
                          const colors = severityColors[flag.severity] || severityColors.info;
                          return (
                            <div
                              key={idx}
                              className={cn(
                                'rounded-lg border p-3',
                                colors.bg,
                                colors.border
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <AlertTriangle className={cn('h-4 w-4 mt-0.5', colors.text)} />
                                <div className="flex-1">
                                  <p className={cn('text-sm font-medium', colors.text)}>
                                    {flag.message}
                                  </p>
                                  {flag.suggestion && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {flag.suggestion}
                                    </p>
                                  )}
                                  {flag.potentialSavings && (
                                    <p className="mt-1 text-xs font-medium text-success-600">
                                      Potential savings: {formatCurrency(flag.potentialSavings, sub.currency)}/year
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Money Leaks Tab */
        <div className="space-y-3">
          {leaks.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
              <div className="rounded-full bg-success-100 p-3">
                <PiggyBank className="h-8 w-8 text-success-600" />
              </div>
              <p className="font-medium text-foreground">No money leaks detected!</p>
              <p className="text-sm text-muted-foreground">
                Your finances look healthy. We&apos;ll keep monitoring.
              </p>
            </div>
          ) : (
            leaks.map((leak) => {
              const colors = severityColors[leak.severity] || severityColors.low;
              return (
                <div
                  key={leak.id}
                  className={cn('rounded-lg border p-4', colors.bg, colors.border)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={cn('h-5 w-5', colors.text)} />
                        <h3 className={cn('font-medium', colors.text)}>{leak.title}</h3>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium uppercase',
                            colors.text,
                            'bg-white/50'
                          )}
                        >
                          {leak.severity}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{leak.description}</p>
                      <p className="mt-2 text-sm text-foreground">{leak.recommendation}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-danger-700">
                        {formatCurrency(leak.annualImpact, leak.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">/year impact</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
