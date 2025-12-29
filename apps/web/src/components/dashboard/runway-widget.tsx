'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { Clock, Calendar, AlertTriangle } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface RunwayData {
  netBurn: number;
  runway: {
    months: number;
    status: 'critical' | 'warning' | 'healthy' | 'excellent';
  };
  cashZeroDate?: string;
  currency: string;
}

interface RunwayWidgetProps {
  workspaceId: string;
}

export function RunwayWidget({ workspaceId }: RunwayWidgetProps) {
  const [data, setData] = useState<RunwayData | null>(null);
  const [loading, setLoading] = useState(true);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/reports/forecast?workspaceId=${workspaceId}&months=12`);
      if (!response.ok) throw new Error('Failed to fetch');

      const forecast = await response.json();

      // Calculate net burn (average monthly expenses - income)
      const netBurn = forecast.summary?.averageMonthlyNet || 0;
      const runway = forecast.summary?.cashRunway || { months: 0, status: 'healthy' };

      // Calculate cash zero date if burning cash
      let cashZeroDate: string | undefined;
      if (netBurn < 0 && runway.months < 24) {
        const date = new Date();
        date.setMonth(date.getMonth() + runway.months);
        cashZeroDate = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      setData({
        netBurn: Math.abs(netBurn),
        runway,
        cashZeroDate,
        currency: forecast.currency || 'USD',
      });
    } catch (error) {
      console.error('Failed to fetch runway data:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchData();
    }
  }, [workspaceId, fetchData]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRunway = (months: number) => {
    if (months >= 24) return '2+ years';
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years > 0) {
      return `${years} yr${years > 1 ? 's' : ''}, ${remainingMonths} mth`;
    }
    return `${months} months`;
  };

  const getStatusStyles = (status: RunwayData['runway']['status']) => {
    switch (status) {
      case 'critical':
        return {
          bg: 'bg-danger-50 dark:bg-danger-950',
          text: 'text-danger-700 dark:text-danger-300',
          ring: 'ring-danger-200 dark:ring-danger-800',
          icon: 'text-danger-500',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-950',
          text: 'text-yellow-700 dark:text-yellow-300',
          ring: 'ring-yellow-200 dark:ring-yellow-800',
          icon: 'text-yellow-500',
        };
      case 'healthy':
        return {
          bg: 'bg-success-50 dark:bg-success-950',
          text: 'text-success-700 dark:text-success-300',
          ring: 'ring-success-200 dark:ring-success-800',
          icon: 'text-success-500',
        };
      case 'excellent':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950',
          text: 'text-emerald-700 dark:text-emerald-300',
          ring: 'ring-emerald-200 dark:ring-emerald-800',
          icon: 'text-emerald-500',
        };
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-12 w-40 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5" />
          <span className="font-medium">Runway</span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Not enough data to calculate runway.</p>
      </div>
    );
  }

  const statusStyles = getStatusStyles(data.runway.status);

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5" />
          <span className="font-medium">Net Burn</span>
        </div>
        {data.runway.status === 'critical' && <AlertTriangle className="h-5 w-5 text-danger-500" />}
      </div>

      <p className="mt-2 text-4xl font-bold tabular-nums text-foreground tracking-tight">
        {formatCurrency(data.netBurn, data.currency)}
        <span className="text-lg font-normal text-muted-foreground">/mo</span>
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {/* Runway */}
        <div className={`rounded-lg ${statusStyles.bg} p-4 ring-1 ${statusStyles.ring}`}>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className={`h-4 w-4 ${statusStyles.icon}`} />
            <span>Runway</span>
          </div>
          <p className={`mt-1 text-xl font-bold ${statusStyles.text}`}>
            {formatRunway(data.runway.months)}
          </p>
        </div>

        {/* Cash Zero */}
        <div className="rounded-lg bg-muted/50 p-4 ring-1 ring-border">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Cash Zero</span>
          </div>
          <p className="mt-1 text-xl font-bold text-foreground">{data.cashZeroDate || 'N/A'}</p>
        </div>
      </div>

      {/* Visual Runway Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>0</span>
          <span>12 months</span>
          <span>24+</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              data.runway.status === 'critical'
                ? 'bg-danger-500'
                : data.runway.status === 'warning'
                  ? 'bg-yellow-500'
                  : data.runway.status === 'healthy'
                    ? 'bg-success-500'
                    : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min((data.runway.months / 24) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
