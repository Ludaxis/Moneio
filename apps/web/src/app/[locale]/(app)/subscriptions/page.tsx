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
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { useLocaleFormat } from '@/hooks/use-locale-format';
import { useTranslateCategory } from '@/hooks/use-translate-category';
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

// Map flag types to translation keys
const flagTypeKeyMap: Record<string, string> = {
  expensive: 'expensive',
  unused: 'unused',
  duplicate: 'duplicate',
  price_increase: 'price_increase',
  'price increase': 'price_increase',
};

// Map suggestion patterns to translation keys
const suggestionKeyMap: Record<string, string> = {
  'Review if this subscription is still needed or if there are cheaper alternatives':
    'reviewSubscription',
  'Check if you are still using this service': 'checkIfUsing',
  'Consider cancelling one of these subscriptions': 'cancelOne',
  'Contact the provider about the price increase or look for alternatives': 'contactProvider',
  'Consider switching to a fee-free bank account or negotiating fee waivers with your current bank':
    'switchBank',
  'Review these charges and contact the merchant if they are duplicates': 'reviewDuplicates',
  'Review this subscription': 'reviewSubscription',
};

export default function SubscriptionsPage() {
  const t = useTranslations('subscriptions');
  const tSeverities = useTranslations('subscriptions.severities');
  const tLeakTypes = useTranslations('subscriptions.leakTypes');
  const tLeakDescriptions = useTranslations('subscriptions.leakDescriptions');
  const tLeakTitles = useTranslations('subscriptions.leakTitles');
  const tLeakSuggestions = useTranslations('subscriptions.leakSuggestions');
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const workspaceId = workspace?.id;
  const { formatCurrency: formatCurrencyLocale, formatNumber, intlLocale } = useLocaleFormat();
  const translateCategory = useTranslateCategory();

  // Helper function to translate severity
  const translateSeverity = useCallback(
    (severity: string): string => {
      const validSeverities = ['low', 'medium', 'high'];
      if (validSeverities.includes(severity)) {
        return tSeverities(severity);
      }
      return severity;
    },
    [tSeverities]
  );

  // Helper function to translate leak type
  const translateLeakType = useCallback(
    (type: string): string => {
      const key = flagTypeKeyMap[type] || type;
      try {
        return tLeakTypes(key);
      } catch {
        return type.replace(/_/g, ' ');
      }
    },
    [tLeakTypes]
  );

  // Helper function to translate money leak title
  // Format: "{merchantName}: {flagType}" or special titles like "Bank Fees Detected"
  const translateLeakTitle = useCallback(
    (title: string): string => {
      // Check for special titles first
      if (title === 'Bank Fees Detected') {
        return tLeakTitles('bankFeesDetected');
      }
      if (title.startsWith('Possible Duplicate Charge:')) {
        const description = title.replace('Possible Duplicate Charge:', '').trim();
        return `${tLeakTitles('possibleDuplicate')}: ${description}`;
      }

      // Parse "{category/merchant}: {flagType}" format
      const colonIndex = title.indexOf(':');
      if (colonIndex > -1) {
        const categoryOrMerchant = title.substring(0, colonIndex).trim();
        const flagType = title.substring(colonIndex + 1).trim();

        // Try to translate category, keep merchant names as-is
        const translatedCategory = translateCategory(categoryOrMerchant) || categoryOrMerchant;
        const translatedType = translateLeakType(flagType);

        return `${translatedCategory}: ${translatedType}`;
      }

      return title;
    },
    [tLeakTitles, translateCategory, translateLeakType]
  );

  // Helper function to translate description
  const translateDescription = useCallback(
    (description: string, currency: string): string => {
      // High monthly cost: {currency} {amount}/month
      const highCostMatch = description.match(/^High monthly cost: (\w+) ([\d.,]+)\/month$/);
      if (highCostMatch) {
        const amount = parseFloat(highCostMatch[2].replace(',', '.'));
        return tLeakDescriptions('highMonthlyCost', {
          currency,
          amount: formatNumber(amount),
        });
      }

      // No charges in {days} days - might be forgotten
      const noChargesMatch = description.match(/^No charges in (\d+) days - might be forgotten$/);
      if (noChargesMatch) {
        return tLeakDescriptions('noChargesInDays', { days: noChargesMatch[1] });
      }

      // Potential duplicate of {merchantName}
      const duplicateMatch = description.match(/^Potential duplicate of (.+)$/);
      if (duplicateMatch) {
        return tLeakDescriptions('potentialDuplicate', { merchantName: duplicateMatch[1] });
      }

      // Price increased by {percent}% (from {currency} {old} to {new})
      const priceMatch = description.match(
        /^Price increased by ([\d.]+)% \(from (\w+) ([\d.,]+) to ([\d.,]+)\)$/
      );
      if (priceMatch) {
        return tLeakDescriptions('priceIncreased', {
          percent: priceMatch[1],
          currency: priceMatch[2],
          oldAmount: formatNumber(parseFloat(priceMatch[3].replace(',', '.'))),
          newAmount: formatNumber(parseFloat(priceMatch[4].replace(',', '.'))),
        });
      }

      // You've paid {currency} {amount} in bank fees ({count} transactions)
      const bankFeesMatch = description.match(
        /^You've paid (\w+) ([\d.,]+) in bank fees \((\d+) transactions\)$/
      );
      if (bankFeesMatch) {
        return tLeakDescriptions('bankFeesDetected', {
          currency: bankFeesMatch[1],
          amount: formatNumber(parseFloat(bankFeesMatch[2].replace(',', '.'))),
          count: bankFeesMatch[3],
        });
      }

      // {count} identical charges of {currency} {amount} detected
      const identicalMatch = description.match(
        /^(\d+) identical charges of (\w+) ([\d.,]+) detected$/
      );
      if (identicalMatch) {
        return tLeakDescriptions('identicalCharges', {
          count: identicalMatch[1],
          currency: identicalMatch[2],
          amount: formatNumber(parseFloat(identicalMatch[3].replace(',', '.'))),
        });
      }

      return description;
    },
    [tLeakDescriptions, formatNumber]
  );

  // Helper function to translate suggestion/recommendation
  const translateSuggestion = useCallback(
    (suggestion: string | null): string => {
      if (!suggestion) return '';
      const key = suggestionKeyMap[suggestion];
      if (key) {
        return tLeakSuggestions(key);
      }
      return suggestion;
    },
    [tLeakSuggestions]
  );

  // Frequency labels using translations
  const frequencyLabels: Record<string, string> = {
    weekly: t('weekly'),
    biweekly: t('biweekly'),
    monthly: t('monthly'),
    quarterly: t('quarterly'),
    annual: t('annual'),
  };

  // Status labels using translations
  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: t('active'), color: 'bg-success-100 text-success-700' },
    paused: { label: t('paused'), color: 'bg-warning-100 text-warning-700' },
    cancelled: { label: t('cancelled'), color: 'bg-muted text-muted-foreground' },
    unknown: { label: t('unknown'), color: 'bg-muted text-muted-foreground' },
  };

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
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          {t('refresh')}
        </button>
      </div>

      {/* Summary Cards */}
      {subscriptionSummary && leaksSummary && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span className="text-sm">{t('monthlySubscriptions')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatCurrency(subscriptionSummary.totalMonthly, subscriptionSummary.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('activeOf', {
                active: formatNumber(subscriptionSummary.activeCount),
                total: formatNumber(subscriptionSummary.subscriptionCount),
              })}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">{t('annualCost')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatCurrency(subscriptionSummary.totalAnnual, subscriptionSummary.currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('projectedYearlyTotal')}</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-warning-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{t('issuesFound')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-warning-700">
              {formatNumber(leaksSummary.totalLeaks)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('newAndFlagged', {
                newCount: formatNumber(leaksSummary.newLeaks),
                flaggedCount: formatNumber(subscriptionSummary.flaggedCount),
              })}
            </p>
          </div>

          <div className="rounded-lg border border-success-200 bg-success-50 p-4">
            <div className="flex items-center gap-2 text-success-600">
              <PiggyBank className="h-4 w-4" />
              <span className="text-sm">{t('potentialSavings')}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-success-700">
              {formatCurrency(leaksSummary.totalPotentialSavings, leaksSummary.currency)}
            </p>
            <p className="mt-1 text-xs text-success-600">{t('perYear')}</p>
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
              {t('title').split(' & ')[0]}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {formatNumber(subscriptions.length)}
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
              {t('moneyLeaks')}
              {leaks.length > 0 && (
                <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs text-danger-700">
                  {formatNumber(leaks.length)}
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
            {t('tryAgain')}
          </button>
        </div>
      ) : activeTab === 'subscriptions' ? (
        <>
          {/* Filters for subscriptions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('searchSubscriptions')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 ps-9 pe-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="relative">
              <select
                value={statusFilter || ''}
                onChange={(e) => setStatusFilter(e.target.value || null)}
                className="appearance-none rounded-lg border border-border bg-background py-2 ps-3 pe-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('allStatuses')}</option>
                <option value="active">{t('active')}</option>
                <option value="paused">{t('paused')}</option>
                <option value="cancelled">{t('cancelled')}</option>
                <option value="unknown">{t('unknown')}</option>
              </select>
              <ChevronDown className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
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
              {t('flaggedOnly')}
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
                {t('clearFilters')}
              </button>
            )}
          </div>

          {/* Subscriptions List */}
          {filteredSubscriptions.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card">
              <CreditCard className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                {subscriptions.length === 0 ? t('noSubscriptions') : t('noSubscriptionsFiltered')}
              </p>
              {subscriptions.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('importMoreTransactions')}</p>
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
                            {formatCurrency(sub.amount, sub.currency)} {t('perCharge')}
                          </span>
                          <span>
                            {sub.chargeCount} {t('charges')}
                          </span>
                          {sub.category && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                              {translateCategory(sub.category)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('firstSeen')} {formatDate(sub.firstSeen)} · {t('lastCharge')}{' '}
                          {formatDate(sub.lastCharge)}
                        </div>
                      </div>

                      <div className="text-end">
                        <p className="text-lg font-bold text-foreground">
                          {formatCurrency(sub.monthlyEquivalent, sub.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('perMonth')}</p>
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
                              className={cn('rounded-lg border p-3', colors.bg, colors.border)}
                            >
                              <div className="flex items-start gap-2">
                                <AlertTriangle className={cn('h-4 w-4 mt-0.5', colors.text)} />
                                <div className="flex-1">
                                  <p className={cn('text-sm font-medium', colors.text)}>
                                    {translateDescription(flag.message, sub.currency)}
                                  </p>
                                  {flag.suggestion && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {translateSuggestion(flag.suggestion)}
                                    </p>
                                  )}
                                  {flag.potentialSavings && (
                                    <p className="mt-1 text-xs font-medium text-success-600">
                                      {t('potentialSavingsPerYear', {
                                        amount: formatCurrencyLocale(
                                          parseFloat(flag.potentialSavings),
                                          sub.currency
                                        ),
                                      })}
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
              <p className="font-medium text-foreground">{t('noLeaksDetected')}</p>
              <p className="text-sm text-muted-foreground">{t('financesHealthy')}</p>
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
                        <h3 className={cn('font-medium', colors.text)}>
                          {translateLeakTitle(leak.title)}
                        </h3>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium uppercase',
                            colors.text,
                            'bg-white/50'
                          )}
                        >
                          {translateSeverity(leak.severity)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {translateDescription(leak.description, leak.currency)}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {translateSuggestion(leak.recommendation)}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-lg font-bold text-danger-700">
                        {formatCurrency(leak.annualImpact, leak.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">{t('yearImpact')}</p>
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
