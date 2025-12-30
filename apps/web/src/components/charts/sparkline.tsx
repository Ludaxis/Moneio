'use client';

import { cn } from '@moneio/ui';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export interface SparklineData {
  value: number;
  label?: string;
}

export interface SparklineProps {
  /** Data points for the sparkline */
  data: SparklineData[];
  /** Color variant */
  variant?: 'income' | 'expense' | 'neutral' | 'primary';
  /** Height of the sparkline */
  height?: number;
  /** Show trend indicator */
  showTrend?: boolean;
  /** Show value label */
  showValue?: boolean;
  /** Value to display (if different from last data point) */
  value?: string;
  /** Loading state */
  loading?: boolean;
  /** Click handler (e.g., to expand to full chart) */
  onClick?: () => void;
  /** Additional className */
  className?: string;
}

const variantColors = {
  income: {
    stroke: 'hsl(var(--chart-income))',
    fill: 'hsl(var(--chart-income))',
    fillOpacity: 0.2,
    trend: 'text-success',
  },
  expense: {
    stroke: 'hsl(var(--chart-expense))',
    fill: 'hsl(var(--chart-expense))',
    fillOpacity: 0.2,
    trend: 'text-danger',
  },
  neutral: {
    stroke: 'hsl(var(--chart-neutral))',
    fill: 'hsl(var(--chart-neutral))',
    fillOpacity: 0.1,
    trend: 'text-muted-foreground',
  },
  primary: {
    stroke: 'hsl(var(--primary))',
    fill: 'hsl(var(--primary))',
    fillOpacity: 0.2,
    trend: 'text-primary',
  },
};

/**
 * Sparkline - Compact inline chart for dashboard widgets
 *
 * Features:
 * - Minimal decoration (no axes, grid, or labels)
 * - Trend indicator (up/down/stable)
 * - Optional value display
 * - Tap to expand functionality
 * - Multiple color variants
 */
export function Sparkline({
  data,
  variant = 'primary',
  height = 48,
  showTrend = true,
  showValue = false,
  value,
  loading = false,
  onClick,
  className,
}: SparklineProps) {
  const colors = variantColors[variant];

  // Calculate trend from data
  const trend = useMemo(() => {
    if (data.length < 2) return 'stable';
    const first = data[0].value;
    const last = data[data.length - 1].value;
    if (last > first * 1.01) return 'up';
    if (last < first * 0.99) return 'down';
    return 'stable';
  }, [data]);

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  // Display value (last data point or custom value)
  const displayValue = value ?? data[data.length - 1]?.value?.toString() ?? '—';

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 animate-pulse', className)} style={{ height }}>
        <div className="flex-1 h-full bg-muted rounded" />
        {showTrend && <div className="w-4 h-4 bg-muted rounded" />}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-muted-foreground text-xs', className)}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'flex items-center gap-2',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className
      )}
    >
      {/* Chart */}
      <div className="flex-1" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`sparkline-gradient-${variant}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.fill} stopOpacity={colors.fillOpacity} />
                <stop offset="100%" stopColor={colors.fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={colors.stroke}
              strokeWidth={2}
              fill={`url(#sparkline-gradient-${variant})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Value and trend */}
      <div className="flex flex-col items-end flex-shrink-0">
        {showValue && <span className="text-sm font-medium amount">{displayValue}</span>}
        {showTrend && <TrendIcon className={cn('h-4 w-4', colors.trend)} />}
      </div>
    </div>
  );
}

/**
 * MiniSparkline - Even smaller variant for inline use
 */
export function MiniSparkline({
  data,
  variant = 'primary',
  className,
}: {
  data: SparklineData[];
  variant?: 'income' | 'expense' | 'neutral' | 'primary';
  className?: string;
}) {
  const colors = variantColors[variant];

  if (data.length === 0) {
    return null;
  }

  return (
    <div className={cn('w-16 h-6', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={colors.stroke}
            strokeWidth={1.5}
            fill="none"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
