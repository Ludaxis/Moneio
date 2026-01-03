'use client';

import { cn } from '@moneio/ui';
import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  DollarSign,
  Calendar,
  PiggyBank,
  Zap,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useLocaleFormat } from '@/hooks/use-locale-format';

interface CashFlowInsight {
  id: string;
  type: 'positive' | 'warning' | 'alert' | 'tip';
  icon: 'trend-up' | 'trend-down' | 'dollar' | 'calendar' | 'piggy' | 'zap';
  title: string;
  description: string;
  metric?: string;
  action?: { label: string; href: string };
}

interface SmartSummary {
  headline: string;
  subtext: string;
  cashflowStatus: 'healthy' | 'stable' | 'attention' | 'critical';
  keyMetrics: {
    netCashflow: number;
    burnRate: number;
    runway: number;
    savingsRate: number;
    currency: string;
  };
  insights: CashFlowInsight[];
  quickTip: string;
}

interface SmartAISummaryProps {
  workspaceId: string;
  startDate: string;
  endDate: string;
}

// Map English recommendations from API to translation keys
const recommendationKeyMap: Record<string, string> = {
  'Focus on generating revenue streams': 'focusOnRevenue',
  'Consider ways to increase margins': 'considerIncreaseMargins',
  'Review expenses and pricing to improve profitability': 'reviewExpensesAndPricing',
  'Urgent: Cut expenses or increase revenue immediately': 'urgentCutExpenses',
  'Build more cash reserves when possible': 'buildMoreReserves',
  'Prioritize extending your cash runway': 'prioritizeExtendRunway',
  'Urgent: Take immediate action to extend runway': 'urgentExtendRunway',
  'Emergency: Secure funding or cut expenses immediately': 'emergencySecureFunding',
  'Build an emergency fund of 3-6 months expenses': 'buildEmergencyFund',
  'Prioritize building cash reserves': 'prioritizeBuildingReserves',
  'Urgent: Build emergency cash buffer': 'urgentBuildBuffer',
  'Track and categorize expenses for better predictability': 'trackAndCategorize',
  'Review spending patterns and identify recurring costs': 'reviewSpendingPatterns',
  'Focus on establishing revenue streams': 'focusOnEstablishingRevenue',
  'Diversify revenue sources for more stability': 'diversifyRevenueSources',
  'Build more predictable revenue streams': 'buildPredictableRevenue',
};

export function SmartAISummary({ workspaceId, startDate, endDate }: SmartAISummaryProps) {
  const t = useTranslations('dashboard');
  const tRec = useTranslations('dashboard.recommendations');
  const tCommon = useTranslations('common');
  const { formatCurrency, formatPercent, formatNumber } = useLocaleFormat();

  const [summary, setSummary] = useState<SmartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useFadeIn({ duration: 0.6, y: -15 }) as React.RefObject<HTMLDivElement>;

  const generateSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all necessary data in parallel
      const [healthRes, metricsRes, cashflowRes, subscriptionsRes] = await Promise.all([
        fetch(`/api/reports/health-score?workspaceId=${workspaceId}`),
        fetch(
          `/api/dashboard/metrics?workspaceId=${workspaceId}&startDate=${startDate}&endDate=${endDate}`
        ),
        fetch(
          `/api/reports/cashflow?workspaceId=${workspaceId}&startDate=${startDate}&endDate=${endDate}`
        ),
        fetch(`/api/insights/subscriptions?workspaceId=${workspaceId}`).catch(() => null),
      ]);

      const insights: CashFlowInsight[] = [];
      let cashflowStatus: SmartSummary['cashflowStatus'] = 'stable';
      let headline = t('aiSummary.headline');
      let subtext = t('aiSummary.subtext');
      let quickTip = t('aiSummary.quickTipDefault');

      // Default metrics
      const keyMetrics = {
        netCashflow: 0,
        burnRate: 0,
        runway: 0,
        savingsRate: 0,
        currency: 'EUR',
      };

      // Process health score (still 12-month based but used for headline only)
      if (healthRes.ok) {
        const health = await healthRes.json();
        const score = health.overallScore || 0;
        const formattedScore = formatNumber(score);

        if (score >= 80) {
          cashflowStatus = 'healthy';
          headline = t('aiSummary.healthExcellent');
          subtext = t('aiSummary.healthExcellentDesc', { score: formattedScore });
        } else if (score >= 60) {
          cashflowStatus = 'stable';
          headline = t('aiSummary.healthGood');
          subtext = t('aiSummary.healthGoodDesc', { score: formattedScore });
        } else if (score >= 40) {
          cashflowStatus = 'attention';
          headline = t('aiSummary.healthAttention');
          subtext = t('aiSummary.healthAttentionDesc', { score: formattedScore });
        } else {
          cashflowStatus = 'critical';
          headline = t('aiSummary.healthCritical');
          subtext = t('aiSummary.healthCriticalDesc', { score: formattedScore });
        }

        if (health.recommendations?.[0]) {
          // Translate the recommendation if we have a mapping, otherwise use the original
          const recommendationText = health.recommendations[0];
          const translationKey = recommendationKeyMap[recommendationText];
          const translatedRecommendation = translationKey
            ? tRec(translationKey as keyof typeof recommendationKeyMap)
            : recommendationText;

          insights.push({
            id: 'recommendation',
            type: score < 60 ? 'warning' : 'tip',
            icon: 'zap',
            title: t('aiSummary.aiRecommendation'),
            description: translatedRecommendation,
          });
        }

        const runwayMetric = health.metrics?.find((m: { name: string }) => m.name === 'runway');
        if (runwayMetric) {
          keyMetrics.runway = parseFloat(runwayMetric.value) || 0;
        }
      }

      // Dashboard metrics (date-range aligned) for the primary numbers
      if (metricsRes.ok) {
        const metrics = await metricsRes.json();
        keyMetrics.netCashflow = metrics.netCashflow?.amount || 0;
        keyMetrics.burnRate = metrics.burnRate?.amount || 0;
        keyMetrics.runway = metrics.runway?.monthsRemaining ?? keyMetrics.runway;
        keyMetrics.currency = metrics.baseCurrency || 'EUR';

        const income = metrics.totalIncome?.amount || 0;
        if (income > 0 && metrics.netCashflow?.amount !== undefined) {
          keyMetrics.savingsRate = Math.round((metrics.netCashflow.amount / income) * 100);
        }

        // Cash flow warning/positive insight based on aligned period
        if (metrics.netCashflow?.amount < 0) {
          insights.push({
            id: 'negative-cashflow',
            type: 'alert',
            icon: 'trend-down',
            title: t('aiSummary.cashFlowWarning'),
            description: t('aiSummary.cashFlowWarningDesc', {
              amount: formatCurrency(Math.abs(metrics.netCashflow.amount), metrics.baseCurrency),
            }),
            metric: t('aiSummary.perPeriod', {
              amount: formatCurrency(metrics.netCashflow.amount, metrics.baseCurrency),
            }),
            action: { label: t('aiSummary.reviewExpenses'), href: '/transactions?type=expense' },
          });
        } else if (metrics.netCashflow?.amount > 0) {
          insights.push({
            id: 'positive-cashflow',
            type: 'positive',
            icon: 'trend-up',
            title: t('aiSummary.positiveCashFlow'),
            description: t('aiSummary.positiveCashFlowDesc', {
              amount: formatCurrency(metrics.netCashflow.amount, metrics.baseCurrency),
            }),
            metric: t('aiSummary.savingsRateMetric', { rate: keyMetrics.savingsRate }),
          });
        }

        // Runway warning based on aligned data
        if (metrics.runway?.monthsRemaining !== null && metrics.runway?.monthsRemaining <= 6) {
          insights.push({
            id: 'runway-warning',
            type: 'alert',
            icon: 'calendar',
            title: t('aiSummary.cashRunwayAlert'),
            description: t('aiSummary.cashRunwayAlertDesc', {
              months: metrics.runway.monthsRemaining,
            }),
            action: { label: t('aiSummary.viewForecast'), href: '/reports?tab=forecast' },
          });
          quickTip = t('aiSummary.quickTipRunway');
        }
      }

      // Process cashflow data (date-range aligned)
      if (cashflowRes.ok) {
        const cashflow = await cashflowRes.json();

        // Spending by category insight
        const topExpenseCategory = cashflow.byCategory
          ?.filter((c: { type: string }) => c.type === 'expense')
          ?.sort((a: { amount: number }, b: { amount: number }) => b.amount - a.amount)?.[0];

        if (topExpenseCategory && topExpenseCategory.percentage > 30) {
          insights.push({
            id: 'top-expense',
            type: 'tip',
            icon: 'piggy',
            title: t('aiSummary.spendingConcentration'),
            description: t('aiSummary.spendingConcentrationDesc', {
              category: topExpenseCategory.categoryName || tCommon('uncategorized'),
              percentage: topExpenseCategory.percentage,
            }),
            action: { label: t('aiSummary.viewBreakdown'), href: '/reports?tab=cashflow' },
          });
        }
      }

      // Process subscriptions
      if (subscriptionsRes?.ok) {
        const subs = await subscriptionsRes.json();
        if (subs.summary?.flaggedCount > 0) {
          insights.push({
            id: 'flagged-subscriptions',
            type: 'warning',
            icon: 'zap',
            title: t('aiSummary.potentialSavingsFound'),
            description: t('aiSummary.potentialSavingsDesc', {
              count: subs.summary.flaggedCount,
            }),
            metric: subs.summary.potentialSavings
              ? t('aiSummary.savingsPerMonth', {
                  amount: formatCurrency(
                    subs.summary.potentialSavings,
                    subs.summary.currency || 'USD'
                  ),
                })
              : undefined,
            action: { label: tCommon('review'), href: '/subscriptions' },
          });
        }
      }

      // Ensure we always have at least one insight
      if (insights.length === 0) {
        insights.push({
          id: 'keep-going',
          type: 'positive',
          icon: 'trend-up',
          title: t('aiSummary.stayOnTrack'),
          description: t('aiSummary.stayOnTrackDesc'),
          action: { label: t('aiSummary.importTransactions'), href: '/transactions/import' },
        });
        quickTip = t('aiSummary.quickTipImport');
      }

      // Limit to top 4 insights
      const prioritizedInsights = insights
        .sort((a, b) => {
          const priority = { alert: 0, warning: 1, tip: 2, positive: 3 };
          return priority[a.type] - priority[b.type];
        })
        .slice(0, 4);

      setSummary({
        headline,
        subtext,
        cashflowStatus,
        keyMetrics,
        insights: prioritizedInsights,
        quickTip,
      });
    } catch (err) {
      console.error('Failed to generate AI summary:', err);
      setError('Unable to generate insights');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t, tRec, tCommon, formatCurrency, formatNumber]);

  useEffect(() => {
    if (workspaceId) {
      generateSummary();
    }
  }, [workspaceId, generateSummary]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 via-background to-primary/10 p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-primary/20" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-primary/20" />
            <div className="h-4 w-64 animate-pulse rounded bg-primary/10" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-primary/10" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return null; // Gracefully hide on error
  }

  const statusColors = {
    healthy: 'from-success-500/10 via-background to-success-500/5 border-success-200',
    stable: 'from-primary/10 via-background to-primary/5 border-primary/20',
    attention: 'from-warning-500/10 via-background to-warning-500/5 border-warning-200',
    critical: 'from-danger-500/10 via-background to-danger-500/5 border-danger-200',
  };

  const statusIcons = {
    healthy: <CheckCircle2 className="h-5 w-5 text-success-600" />,
    stable: <Sparkles className="h-5 w-5 text-primary" />,
    attention: <AlertTriangle className="h-5 w-5 text-warning-600" />,
    critical: <AlertTriangle className="h-5 w-5 text-danger-600" />,
  };

  const insightIcons = {
    'trend-up': <TrendingUp className="h-4 w-4" />,
    'trend-down': <TrendingDown className="h-4 w-4" />,
    dollar: <DollarSign className="h-4 w-4" />,
    calendar: <Calendar className="h-4 w-4" />,
    piggy: <PiggyBank className="h-4 w-4" />,
    zap: <Zap className="h-4 w-4" />,
  };

  const insightTypeStyles = {
    positive: 'bg-success-50 border-success-200 dark:bg-success-950 dark:border-success-800',
    warning: 'bg-warning-50 border-warning-200 dark:bg-warning-950 dark:border-warning-800',
    alert: 'bg-danger-50 border-danger-200 dark:bg-danger-950 dark:border-danger-800',
    tip: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
  };

  const insightIconStyles = {
    positive: 'bg-success-100 text-success-600 dark:bg-success-900 dark:text-success-400',
    warning: 'bg-warning-100 text-warning-600 dark:bg-warning-900 dark:text-warning-400',
    alert: 'bg-danger-100 text-danger-600 dark:bg-danger-900 dark:text-danger-400',
    tip: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400',
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-xl border bg-gradient-to-br p-6 transition-all',
        statusColors[summary.cashflowStatus]
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/80 backdrop-blur shadow-sm">
            {statusIcons[summary.cashflowStatus]}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{summary.headline}</h2>
            <p className="text-sm text-muted-foreground truncate">{summary.subtext}</p>
          </div>
        </div>
        <button
          onClick={generateSummary}
          className="flex-shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-background/50 hover:text-foreground transition-colors"
          title="Refresh insights"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Key Metrics */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg bg-background/60 backdrop-blur p-3">
          <p className="text-xs text-muted-foreground truncate">{t('aiSummary.netCashFlow')}</p>
          <p
            className={cn(
              'mt-1 text-lg font-bold tabular-nums truncate',
              summary.keyMetrics.netCashflow >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {formatCurrency(summary.keyMetrics.netCashflow, summary.keyMetrics.currency)}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 backdrop-blur p-3">
          <p className="text-xs text-muted-foreground truncate">{t('aiSummary.monthlyBurn')}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-foreground truncate">
            {formatCurrency(summary.keyMetrics.burnRate, summary.keyMetrics.currency)}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 backdrop-blur p-3">
          <p className="text-xs text-muted-foreground truncate">{t('aiSummary.runway')}</p>
          <p className="mt-1 text-lg font-bold text-foreground truncate">
            {t('aiSummary.monthsCount', { count: formatNumber(summary.keyMetrics.runway) })}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 backdrop-blur p-3">
          <p className="text-xs text-muted-foreground truncate">{t('aiSummary.savingsRate')}</p>
          <p
            className={cn(
              'mt-1 text-lg font-bold tabular-nums truncate',
              summary.keyMetrics.savingsRate >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {formatPercent(summary.keyMetrics.savingsRate)}
          </p>
        </div>
      </div>

      {/* AI Insights */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {summary.insights.map((insight) => (
          <div
            key={insight.id}
            className={cn(
              'rounded-lg border p-3 transition-all hover:shadow-sm',
              insightTypeStyles[insight.type]
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn('flex-shrink-0 rounded-lg p-1.5', insightIconStyles[insight.type])}
              >
                {insightIcons[insight.icon]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {insight.title}
                  </p>
                  {insight.metric && (
                    <span className="flex-shrink-0 text-xs font-semibold text-foreground/80 tabular-nums">
                      {insight.metric}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {insight.description}
                </p>
                {insight.action && (
                  <Link
                    href={insight.action.href}
                    className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                  >
                    {insight.action.label}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Tip Footer */}
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-background/40 px-3 py-2">
        <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground line-clamp-1 flex-1">{summary.quickTip}</p>
        <Link
          href="/reports"
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t('aiSummary.viewReports')}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
