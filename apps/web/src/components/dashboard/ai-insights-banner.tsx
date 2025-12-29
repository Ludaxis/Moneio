'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { Sparkles, TrendingDown, TrendingUp, AlertTriangle, Lightbulb, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface AIInsight {
  id: string;
  type: 'warning' | 'opportunity' | 'info' | 'alert';
  title: string;
  description: string;
  metric?: {
    value: string;
    change?: number;
    direction?: 'up' | 'down';
  };
  action?: {
    label: string;
    href: string;
  };
}

interface AIInsightsBannerProps {
  workspaceId: string;
}

export function AIInsightsBanner({ workspaceId }: AIInsightsBannerProps) {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const containerRef = useFadeIn({ duration: 0.5, y: -10 }) as React.RefObject<HTMLDivElement>;

  const fetchInsights = useCallback(async () => {
    try {
      // Fetch health score for insights
      const [healthRes, forecastRes] = await Promise.all([
        fetch(`/api/reports/health-score?workspaceId=${workspaceId}`),
        fetch(`/api/reports/forecast?workspaceId=${workspaceId}&months=3`),
      ]);

      const newInsights: AIInsight[] = [];

      if (healthRes.ok) {
        const health = await healthRes.json();

        // Add insight based on health score
        if (health.overallScore < 40) {
          newInsights.push({
            id: 'health-critical',
            type: 'alert',
            title: 'Financial Health Needs Attention',
            description:
              health.recommendations[0] || 'Your financial health score is below optimal levels.',
            metric: {
              value: `${health.overallScore}/100`,
              direction: 'down',
            },
          });
        } else if (health.overallScore < 60) {
          newInsights.push({
            id: 'health-warning',
            type: 'warning',
            title: 'Room for Improvement',
            description: health.recommendations[0] || 'Consider reviewing your financial metrics.',
            metric: {
              value: `${health.overallScore}/100`,
            },
          });
        }

        // Check specific metrics
        const runwayMetric = health.metrics.find((m: { name: string }) => m.name === 'runway');
        if (runwayMetric && runwayMetric.score < 50) {
          newInsights.push({
            id: 'runway-low',
            type: 'alert',
            title: 'Low Cash Runway',
            description:
              'Your current runway is below 6 months. Consider reducing expenses or increasing revenue.',
            metric: {
              value: runwayMetric.value,
              direction: 'down',
            },
          });
        }
      }

      if (forecastRes.ok) {
        const forecast = await forecastRes.json();

        if (forecast.summary?.averageMonthlyNet < 0) {
          newInsights.push({
            id: 'negative-cashflow',
            type: 'warning',
            title: 'Negative Cash Flow Projected',
            description: `Forecast shows average monthly loss of ${formatCurrency(Math.abs(forecast.summary.averageMonthlyNet), forecast.currency)}.`,
            metric: {
              value: formatCurrency(forecast.summary.averageMonthlyNet, forecast.currency),
              direction: 'down',
            },
          });
        }

        if (forecast.summary?.lowestCashPoint?.amount < 0) {
          newInsights.push({
            id: 'cash-negative',
            type: 'alert',
            title: 'Cash May Go Negative',
            description: `Based on current trends, cash could go negative in ${forecast.summary.lowestCashPoint.month}.`,
            metric: {
              value: formatCurrency(forecast.summary.lowestCashPoint.amount, forecast.currency),
              direction: 'down',
            },
          });
        }
      }

      // Add a positive insight if everything looks good
      if (newInsights.length === 0) {
        newInsights.push({
          id: 'all-good',
          type: 'info',
          title: 'Looking Good!',
          description: 'Your finances are healthy. Keep up the great work!',
        });
      }

      setInsights(newInsights);
    } catch (error) {
      console.error('Failed to fetch AI insights:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchInsights();
    }
  }, [workspaceId, fetchInsights]);

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const visibleInsights = insights.filter((i) => !dismissed.has(i.id));

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-950 dark:to-primary-900 p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-primary-200 dark:bg-primary-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-primary-200 dark:bg-primary-800" />
            <div className="h-3 w-64 animate-pulse rounded bg-primary-200 dark:bg-primary-800" />
          </div>
        </div>
      </div>
    );
  }

  if (visibleInsights.length === 0) {
    return null;
  }

  const getInsightStyles = (type: AIInsight['type']) => {
    switch (type) {
      case 'alert':
        return {
          bg: 'bg-gradient-to-r from-danger-50 to-danger-100 dark:from-danger-950 dark:to-danger-900',
          border: 'border-danger-200 dark:border-danger-800',
          icon: 'text-danger-600',
          iconBg: 'bg-danger-100 dark:bg-danger-900',
        };
      case 'warning':
        return {
          bg: 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600',
          iconBg: 'bg-yellow-100 dark:bg-yellow-900',
        };
      case 'opportunity':
        return {
          bg: 'bg-gradient-to-r from-success-50 to-emerald-50 dark:from-success-950 dark:to-emerald-950',
          border: 'border-success-200 dark:border-success-800',
          icon: 'text-success-600',
          iconBg: 'bg-success-100 dark:bg-success-900',
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-950 dark:to-blue-950',
          border: 'border-primary-200 dark:border-primary-800',
          icon: 'text-primary-600',
          iconBg: 'bg-primary-100 dark:bg-primary-900',
        };
    }
  };

  const getInsightIcon = (type: AIInsight['type']) => {
    switch (type) {
      case 'alert':
        return <AlertTriangle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      case 'opportunity':
        return <Lightbulb className="h-5 w-5" />;
      default:
        return <Sparkles className="h-5 w-5" />;
    }
  };

  return (
    <div ref={containerRef} className="space-y-3">
      {visibleInsights.map((insight) => {
        const styles = getInsightStyles(insight.type);
        return (
          <div
            key={insight.id}
            className={`rounded-xl border ${styles.border} ${styles.bg} p-4 transition-all hover:shadow-md`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 rounded-full ${styles.iconBg} p-2 ${styles.icon}`}>
                {getInsightIcon(insight.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{insight.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
                  </div>
                  {insight.metric && (
                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center gap-1">
                        {insight.metric.direction === 'up' && (
                          <TrendingUp className="h-4 w-4 text-success-600" />
                        )}
                        {insight.metric.direction === 'down' && (
                          <TrendingDown className="h-4 w-4 text-danger-600" />
                        )}
                        <span className="text-lg font-bold tabular-nums text-foreground">
                          {insight.metric.value}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {insight.action && (
                  <a
                    href={insight.action.href}
                    className="mt-2 inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    {insight.action.label} &rarr;
                  </a>
                )}
              </div>
              <button
                onClick={() => handleDismiss(insight.id)}
                className="flex-shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
