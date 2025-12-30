'use client';

import { cn } from '@moneio/ui';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

export interface TrendBadgeProps {
  /** Percentage change */
  percentage: number;
  /** Trend direction */
  direction: 'up' | 'down' | 'stable';
  /** Optional period label */
  period?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /**
   * Whether "up" is good (default true).
   * For expenses, you might want up = bad (red), down = good (green)
   */
  isUpGood?: boolean;
}

/**
 * TrendBadge - Compact trend indicator
 *
 * Shows percentage change with color-coded direction.
 * - Green for positive changes (or negative if isUpGood=false)
 * - Red for negative changes (or positive if isUpGood=false)
 * - Gray for stable/no change
 */
export function TrendBadge({
  percentage,
  direction,
  period,
  size = 'sm',
  isUpGood = true,
}: TrendBadgeProps) {
  // Determine if this change is "good" or "bad"
  const isPositive =
    direction === 'stable' ? null : isUpGood ? direction === 'up' : direction === 'down';

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const paddingSize = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  // Color classes based on whether change is positive/negative
  const colorClasses =
    isPositive === null
      ? 'bg-muted text-muted-foreground'
      : isPositive
        ? 'bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-400'
        : 'bg-danger-50 text-danger-700 dark:bg-danger-950 dark:text-danger-400';

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium',
          paddingSize,
          textSize,
          colorClasses
        )}
      >
        {direction === 'up' && <TrendingUp className={iconSize} />}
        {direction === 'down' && <TrendingDown className={iconSize} />}
        {direction === 'stable' && <Minus className={iconSize} />}
        <span className="tabular-nums">
          {direction === 'stable'
            ? '0%'
            : `${direction === 'up' ? '+' : '-'}${Math.abs(percentage)}%`}
        </span>
      </div>
      {period && <span className="text-xs text-muted-foreground">{period}</span>}
    </div>
  );
}
