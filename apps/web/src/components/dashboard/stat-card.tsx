'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  loading?: boolean;
  delay?: number;
}

export function StatCard({ label, value, trend, loading, delay = 0 }: StatCardProps) {
  const containerRef = useFadeIn({
    duration: 0.4,
    delay,
    y: 15,
  }) as React.RefObject<HTMLDivElement>;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-8 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-sm">
          {trend.direction === 'up' && (
            <>
              <TrendingUp className="h-4 w-4 text-chart-income" />
              <span className="text-chart-income">+{trend.percentage.toFixed(1)}%</span>
            </>
          )}
          {trend.direction === 'down' && (
            <>
              <TrendingDown className="h-4 w-4 text-chart-expense" />
              <span className="text-chart-expense">-{trend.percentage.toFixed(1)}%</span>
            </>
          )}
          {trend.direction === 'stable' && (
            <>
              <Minus className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">No change</span>
            </>
          )}
          <span className="text-muted-foreground">vs last month</span>
        </div>
      )}
    </div>
  );
}
