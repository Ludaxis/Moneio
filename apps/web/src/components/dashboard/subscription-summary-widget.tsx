'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  CreditCard,
  Loader2,
  TrendingDown,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface CategoryBreakdown {
  category: string;
  monthly: string;
  count: number;
}

interface SubscriptionSummary {
  totalMonthly: string;
  totalAnnual: string;
  subscriptionCount: number;
  activeCount: number;
  flaggedCount: number;
  potentialSavings: string;
  currency: string;
  byCategory: CategoryBreakdown[];
}

interface SubscriptionsData {
  subscriptions: unknown[];
  summary: SubscriptionSummary;
}

interface SubscriptionSummaryWidgetProps {
  workspaceId: string;
}

export function SubscriptionSummaryWidget({ workspaceId }: SubscriptionSummaryWidgetProps) {
  const [data, setData] = useState<SubscriptionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchSubscriptions = useCallback(async () => {
    try {
      const response = await fetch(`/api/insights/subscriptions?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch subscriptions');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch subscriptions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchSubscriptions();
    }
  }, [workspaceId, fetchSubscriptions]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
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
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Subscriptions</h2>
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
  const hasSubscriptions = summary.subscriptionCount > 0;
  const monthlyTotal = parseFloat(summary.totalMonthly);
  const annualTotal = parseFloat(summary.totalAnnual);
  const potentialSavings = parseFloat(summary.potentialSavings);

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Subscriptions</h2>
        </div>
        {summary.flaggedCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">
            <AlertTriangle className="h-3 w-3" />
            {summary.flaggedCount} flagged
          </span>
        )}
      </div>

      {!hasSubscriptions ? (
        <div className="mt-6 flex flex-col items-center py-6 text-center">
          <div className="rounded-full bg-muted p-3">
            <CreditCard className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">No subscriptions detected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import more transactions to detect recurring patterns.
          </p>
        </div>
      ) : (
        <>
          {/* Monthly Total */}
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">Monthly Total</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold text-foreground">
                {summary.currency}{' '}
                {monthlyTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="mb-1 text-sm text-muted-foreground">
                ({summary.currency}{' '}
                {annualTotal.toLocaleString('en-US', { minimumFractionDigits: 0 })}/year)
              </p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-xl font-semibold text-foreground">{summary.activeCount}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">Total Tracked</p>
              <p className="text-xl font-semibold text-foreground">{summary.subscriptionCount}</p>
            </div>
          </div>

          {/* Potential Savings */}
          {potentialSavings > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-success-50 p-3">
              <TrendingDown className="h-5 w-5 text-success-600" />
              <div>
                <p className="text-sm font-medium text-success-700">
                  {summary.currency}{' '}
                  {potentialSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })} potential
                  savings
                </p>
                <p className="text-xs text-success-600">Review flagged subscriptions</p>
              </div>
            </div>
          )}

          {/* Top Categories */}
          {summary.byCategory.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-foreground">Top Categories</p>
              <div className="mt-2 space-y-2">
                {summary.byCategory.slice(0, 3).map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{cat.category}</span>
                    <span className="text-sm font-medium text-foreground">
                      {summary.currency}{' '}
                      {parseFloat(cat.monthly).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                      <span className="ml-1 text-xs text-muted-foreground">({cat.count})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View All Link */}
          <Link
            href={`/subscriptions?workspaceId=${workspaceId}`}
            className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Manage subscriptions
            <ChevronRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}
