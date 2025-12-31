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
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

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
    netCashflowFormatted: string;
    burnRate: number;
    burnRateFormatted: string;
    runway: number;
    runwayText: string;
    savingsRate: number;
  };
  insights: CashFlowInsight[];
  quickTip: string;
}

interface SmartAISummaryProps {
  workspaceId: string;
  startDate: string;
  endDate: string;
}

export function SmartAISummary({ workspaceId, startDate, endDate }: SmartAISummaryProps) {
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
      let headline = 'Your finances at a glance';
      let subtext = "Here's what's happening with your money";
      let quickTip = 'Keep tracking your expenses for better insights.';

      // Default metrics
      const keyMetrics = {
        netCashflow: 0,
        netCashflowFormatted: '$0',
        burnRate: 0,
        burnRateFormatted: '$0',
        runway: 0,
        runwayText: '- months',
        savingsRate: 0,
      };

      // Process health score (still 12-month based but used for headline only)
      if (healthRes.ok) {
        const health = await healthRes.json();
        const score = health.overallScore || 0;

        if (score >= 80) {
          cashflowStatus = 'healthy';
          headline = 'Excellent financial health!';
          subtext = `Your health score is ${score}/100 - you're doing great`;
        } else if (score >= 60) {
          cashflowStatus = 'stable';
          headline = 'Good financial standing';
          subtext = `Health score: ${score}/100 - room for improvement`;
        } else if (score >= 40) {
          cashflowStatus = 'attention';
          headline = 'Needs attention';
          subtext = `Health score: ${score}/100 - let's work on this`;
        } else {
          cashflowStatus = 'critical';
          headline = 'Financial health alert';
          subtext = `Health score: ${score}/100 - action needed`;
        }

        if (health.recommendations?.[0]) {
          insights.push({
            id: 'recommendation',
            type: score < 60 ? 'warning' : 'tip',
            icon: 'zap',
            title: 'AI Recommendation',
            description: health.recommendations[0],
          });
        }

        const runwayMetric = health.metrics?.find((m: { name: string }) => m.name === 'runway');
        if (runwayMetric) {
          keyMetrics.runway = parseFloat(runwayMetric.value) || 0;
          keyMetrics.runwayText = runwayMetric.value;
        }
      }

      // Dashboard metrics (date-range aligned) for the primary numbers
      if (metricsRes.ok) {
        const metrics = await metricsRes.json();
        keyMetrics.netCashflow = metrics.netCashflow.amount || 0;
        keyMetrics.netCashflowFormatted = metrics.netCashflow.formatted || '$0';
        keyMetrics.burnRate = metrics.burnRate.amount || 0;
        keyMetrics.burnRateFormatted = metrics.burnRate.formatted || '$0';
        keyMetrics.runway = metrics.runway?.monthsRemaining ?? keyMetrics.runway;
        keyMetrics.runwayText =
          metrics.runway?.monthsRemaining !== undefined
            ? `${metrics.runway.monthsRemaining} months`
            : keyMetrics.runwayText;

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
            title: 'Cash Flow Warning',
            description: `You're spending ${formatCurrency(
              Math.abs(metrics.netCashflow.amount),
              metrics.baseCurrency
            )} more than you earn for this period.`,
            metric: `${formatCurrency(metrics.netCashflow.amount, metrics.baseCurrency)}/period`,
            action: { label: 'Review expenses', href: '/transactions?type=expense' },
          });
        } else if (metrics.netCashflow?.amount > 0) {
          insights.push({
            id: 'positive-cashflow',
            type: 'positive',
            icon: 'trend-up',
            title: 'Positive Cash Flow',
            description: `You're saving ${formatCurrency(
              metrics.netCashflow.amount,
              metrics.baseCurrency
            )} over this period.`,
            metric: `+${keyMetrics.savingsRate}% savings rate`,
          });
        }

        // Runway warning based on aligned data
        if (metrics.runway?.monthsRemaining !== null && metrics.runway?.monthsRemaining <= 6) {
          insights.push({
            id: 'runway-warning',
            type: 'alert',
            icon: 'calendar',
            title: 'Cash Runway Alert',
            description: `At current spending, cash could run out in ${metrics.runway.monthsRemaining} months.`,
            action: { label: 'View forecast', href: '/reports?tab=forecast' },
          });
          quickTip =
            'Consider reducing non-essential expenses or increasing income to extend your runway.';
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
            title: 'Spending Concentration',
            description: `${topExpenseCategory.categoryName || 'Uncategorized'} accounts for ${topExpenseCategory.percentage}% of expenses`,
            action: { label: 'View breakdown', href: '/reports?tab=cashflow' },
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
            title: 'Potential Savings Found',
            description: `${subs.summary.flaggedCount} subscriptions flagged for review`,
            metric: subs.summary.potentialSavings
              ? `Save ${formatCurrency(subs.summary.potentialSavings, subs.summary.currency || 'USD')}/mo`
              : undefined,
            action: { label: 'Review', href: '/subscriptions' },
          });
        }
      }

      // Ensure we always have at least one insight
      if (insights.length === 0) {
        insights.push({
          id: 'keep-going',
          type: 'positive',
          icon: 'trend-up',
          title: 'Stay on Track',
          description: 'Continue monitoring your finances to build a complete picture.',
          action: { label: 'Import transactions', href: '/transactions/import' },
        });
        quickTip =
          'Import more transactions to unlock deeper AI insights about your spending patterns.';
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
  }, [workspaceId]);

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
          <p className="text-xs text-muted-foreground truncate">Net Cash Flow</p>
          <p
            className={cn(
              'mt-1 text-lg font-bold tabular-nums truncate',
              summary.keyMetrics.netCashflow >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {summary.keyMetrics.netCashflowFormatted}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 backdrop-blur p-3">
          <p className="text-xs text-muted-foreground truncate">Monthly Burn</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-foreground truncate">
            {summary.keyMetrics.burnRateFormatted}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 backdrop-blur p-3">
          <p className="text-xs text-muted-foreground truncate">Runway</p>
          <p className="mt-1 text-lg font-bold text-foreground truncate">
            {summary.keyMetrics.runwayText}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 backdrop-blur p-3">
          <p className="text-xs text-muted-foreground truncate">Savings Rate</p>
          <p
            className={cn(
              'mt-1 text-lg font-bold tabular-nums truncate',
              summary.keyMetrics.savingsRate >= 0 ? 'text-success-600' : 'text-danger-600'
            )}
          >
            {summary.keyMetrics.savingsRate}%
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
          View Reports
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
