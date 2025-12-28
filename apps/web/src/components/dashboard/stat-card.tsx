'use client';

import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  loading?: boolean;
}

export function StatCard({ label, value, trend, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-8 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-sm">
          {trend.direction === 'up' && (
            <>
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-green-500">+{trend.percentage.toFixed(1)}%</span>
            </>
          )}
          {trend.direction === 'down' && (
            <>
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-red-500">-{trend.percentage.toFixed(1)}%</span>
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
