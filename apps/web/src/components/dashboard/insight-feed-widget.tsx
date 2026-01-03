'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  Info,
  Lightbulb,
  Loader2,
  TrendingUp,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface Insight {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'alert' | 'positive';
  title: string;
  message: string;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

interface InsightsSummary {
  total: number;
  unread: number;
  bySeverity: Record<string, number>;
}

interface InsightsData {
  insights: Insight[];
  summary: InsightsSummary;
}

interface InsightFeedWidgetProps {
  workspaceId: string;
}

const severityConfig: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode; iconBg: string }
> = {
  alert: {
    bg: 'bg-danger-50',
    text: 'text-danger-700',
    icon: <AlertCircle className="h-4 w-4" />,
    iconBg: 'bg-danger-100 text-danger-600',
  },
  warning: {
    bg: 'bg-warning-50',
    text: 'text-warning-700',
    icon: <AlertTriangle className="h-4 w-4" />,
    iconBg: 'bg-warning-100 text-warning-600',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    icon: <Info className="h-4 w-4" />,
    iconBg: 'bg-blue-100 text-blue-600',
  },
  positive: {
    bg: 'bg-success-50',
    text: 'text-success-700',
    icon: <TrendingUp className="h-4 w-4" />,
    iconBg: 'bg-success-100 text-success-600',
  },
};

export function InsightFeedWidget({ workspaceId }: InsightFeedWidgetProps) {
  const t = useTranslations('dashboard');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchInsights = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/insights?workspaceId=${workspaceId}&filter=unread&limit=5`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchInsights();
    }
  }, [workspaceId, fetchInsights]);

  const handleDismiss = async (insightId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDismissingId(insightId);

    try {
      const response = await fetch(`/api/insights/${insightId}/dismiss`, {
        method: 'POST',
      });

      if (response.ok) {
        // Remove from local state
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            insights: prev.insights.filter((i) => i.id !== insightId),
            summary: {
              ...prev.summary,
              total: prev.summary.total - 1,
              unread: prev.summary.unread - 1,
            },
          };
        });
      }
    } catch (err) {
      console.error('Failed to dismiss insight:', err);
    } finally {
      setDismissingId(null);
    }
  };

  const handleMarkAsRead = async (insightId: string) => {
    try {
      await fetch(`/api/insights/${insightId}/read`, {
        method: 'POST',
      });

      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          insights: prev.insights.map((i) =>
            i.id === insightId ? { ...i, readAt: new Date().toISOString() } : i
          ),
          summary: {
            ...prev.summary,
            unread: Math.max(0, prev.summary.unread - 1),
          },
        };
      });
    } catch (err) {
      console.error('Failed to mark insight as read:', err);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-muted-foreground" />
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-6 flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{t('aiInsightsTitle')}</h2>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-danger-600">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { insights, summary } = data;
  const hasInsights = insights.length > 0;

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{t('aiInsightsTitle')}</h2>
        </div>
        {summary.unread > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Bell className="h-3 w-3" />
            {t('newCount', { count: summary.unread })}
          </span>
        )}
      </div>

      {!hasInsights ? (
        <div className="mt-6 flex flex-col items-center py-6 text-center">
          <div className="rounded-full bg-success-100 p-3">
            <Check className="h-6 w-6 text-success-600" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{t('allCaughtUp')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('noNewInsightsDesc')}
          </p>
        </div>
      ) : (
        <>
          {/* Insights List */}
          <div className="mt-4 space-y-3">
            {insights.map((insight) => {
              const config = severityConfig[insight.severity] || severityConfig.info;
              const isUnread = !insight.readAt;

              return (
                <div
                  key={insight.id}
                  className={`group relative rounded-lg border p-3 transition-colors ${
                    isUnread ? 'border-primary/30 bg-primary/5' : 'border-border'
                  }`}
                  onClick={() => isUnread && handleMarkAsRead(insight.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      isUnread && handleMarkAsRead(insight.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start gap-3">
                    <div className={`rounded-full p-1.5 ${config.iconBg}`}>{config.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{insight.title}</p>
                        <button
                          onClick={(e) => handleDismiss(insight.id, e)}
                          disabled={dismissingId === insight.id}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
                          title="Dismiss"
                        >
                          {dismissingId === insight.id ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : (
                            <X className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {insight.message}
                      </p>
                      {insight.actionUrl && (
                        <Link
                          href={insight.actionUrl}
                          className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t('viewDetails')}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                  {isUnread && (
                    <span className="absolute top-3 right-10 h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
              );
            })}
          </div>

          {/* View All Link */}
          <Link
            href={`/insights?workspaceId=${workspaceId}`}
            className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t('viewAllInsights')}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}
