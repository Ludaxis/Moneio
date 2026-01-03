'use client';

/**
 * Dashboard Skeleton Components
 *
 * Loading states for dashboard sections with Suspense boundaries.
 */

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

function Skeleton({ className, style }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-muted ${className || ''}`} style={style} />;
}

/**
 * Skeleton for BalanceCard (4 cards in a row)
 */
export function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for CashflowChart
 */
export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="h-[300px] flex items-end justify-around gap-2">
        {[0.6, 0.8, 0.5, 0.9, 0.7, 0.4, 0.85, 0.65, 0.75, 0.55, 0.8, 0.6].map((height, i) => (
          <Skeleton key={i} className="w-8 rounded-t" style={{ height: `${height * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for recent transactions list
 */
export function TransactionsSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for widget cards (RunwayWidget, HealthScoreWidget, etc.)
 */
export function WidgetSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <Skeleton className="h-5 w-28 mb-4" />
      <Skeleton className="h-12 w-24 mb-3" />
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

/**
 * Skeleton for AI Summary section
 */
export function AISummarySkeleton() {
  return (
    <div className="rounded-xl border border-border bg-gradient-to-r from-primary/5 to-secondary/5 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-40 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-2" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    </div>
  );
}

/**
 * Full dashboard skeleton for initial load
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* AI Summary */}
      <AISummarySkeleton />

      {/* Metrics */}
      <MetricsSkeleton />

      {/* Chart */}
      <ChartSkeleton />

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <WidgetSkeleton />
          <WidgetSkeleton />
        </div>
        <div className="space-y-6">
          <WidgetSkeleton />
          <WidgetSkeleton />
        </div>
      </div>

      {/* Transactions */}
      <TransactionsSkeleton />
    </div>
  );
}
