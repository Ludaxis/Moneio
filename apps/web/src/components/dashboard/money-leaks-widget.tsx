'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  ChevronRight,
  Copy,
  Loader2,
  PiggyBank,
  TrendingDown,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface MoneyLeak {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  annualImpact: string;
  currency: string;
}

interface MoneyLeaksSummary {
  totalLeaks: number;
  newLeaks: number;
  totalPotentialSavings: string;
  currency: string;
  topLeaks: MoneyLeak[];
}

interface MoneyLeaksData {
  leaks: MoneyLeak[];
  summary: MoneyLeaksSummary;
}

interface MoneyLeaksWidgetProps {
  workspaceId: string;
}

const severityColors: Record<string, { bg: string; text: string; icon: string }> = {
  high: { bg: 'bg-danger-100', text: 'text-danger-700', icon: 'text-danger-600' },
  medium: { bg: 'bg-warning-100', text: 'text-warning-700', icon: 'text-warning-600' },
  low: { bg: 'bg-muted', text: 'text-muted-foreground', icon: 'text-muted-foreground' },
};

const typeIcons: Record<string, React.ReactNode> = {
  subscription: <Banknote className="h-4 w-4" />,
  fee: <TrendingDown className="h-4 w-4" />,
  duplicate_charge: <Copy className="h-4 w-4" />,
  price_creep: <AlertTriangle className="h-4 w-4" />,
  unused_service: <AlertCircle className="h-4 w-4" />,
};

export function MoneyLeaksWidget({ workspaceId }: MoneyLeaksWidgetProps) {
  const [data, setData] = useState<MoneyLeaksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchMoneyLeaks = useCallback(async () => {
    try {
      const response = await fetch(`/api/insights/money-leaks?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch money leaks');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch money leaks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchMoneyLeaks();
    }
  }, [workspaceId, fetchMoneyLeaks]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5 text-muted-foreground" />
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
          <PiggyBank className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Money Leaks</h2>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-danger-600">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;
  const hasLeaks = summary.totalLeaks > 0;
  const potentialSavings = parseFloat(summary.totalPotentialSavings);

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Money Leaks</h2>
        </div>
        {hasLeaks && (
          <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-medium text-danger-700">
            {summary.totalLeaks} found
          </span>
        )}
      </div>

      {!hasLeaks ? (
        <div className="mt-6 flex flex-col items-center py-6 text-center">
          <div className="rounded-full bg-success-100 p-3">
            <PiggyBank className="h-6 w-6 text-success-600" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">No money leaks detected!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your finances look healthy. We&apos;ll keep monitoring.
          </p>
        </div>
      ) : (
        <>
          {/* Potential Savings */}
          <div className="mt-4 rounded-lg bg-warning-50 p-4">
            <p className="text-sm text-warning-700">Potential Annual Savings</p>
            <p className="mt-1 text-2xl font-bold text-warning-900">
              {summary.currency}{' '}
              {potentialSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Top Leaks */}
          <div className="mt-4 space-y-3">
            {summary.topLeaks.slice(0, 3).map((leak) => {
              const colors = severityColors[leak.severity] || severityColors.low;
              return (
                <div
                  key={leak.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <div className={`rounded-full p-1.5 ${colors.bg}`}>
                    <span className={colors.icon}>
                      {typeIcons[leak.type] || <AlertCircle className="h-4 w-4" />}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{leak.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {leak.currency}{' '}
                      {parseFloat(leak.annualImpact).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                      /year
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                  >
                    {leak.severity}
                  </span>
                </div>
              );
            })}
          </div>

          {/* View All Link */}
          <Link
            href={`/subscriptions?workspaceId=${workspaceId}`}
            className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all leaks
            <ChevronRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}
