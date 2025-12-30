'use client';

import { cn } from '@moneio/ui';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KPICardProps {
  /** KPI label */
  label: string;
  /** KPI value (formatted) */
  value: string;
  /** Trend direction */
  trend?: 'up' | 'down' | 'stable';
  /** Trend percentage */
  trendValue?: number;
  /** Trend period label */
  trendPeriod?: string;
  /** Card type for styling */
  type?: 'primary' | 'success' | 'danger' | 'neutral';
  /** Icon to display */
  icon?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Additional className */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

const typeStyles = {
  primary: {
    gradient: 'from-primary/10 to-primary/5',
    border: 'border-primary/20',
    icon: 'text-primary',
    value: 'text-primary',
  },
  success: {
    gradient: 'from-success/10 to-success/5',
    border: 'border-success/20',
    icon: 'text-success',
    value: 'text-success',
  },
  danger: {
    gradient: 'from-danger/10 to-danger/5',
    border: 'border-danger/20',
    icon: 'text-danger',
    value: 'text-danger',
  },
  neutral: {
    gradient: 'from-muted to-muted/50',
    border: 'border-border',
    icon: 'text-muted-foreground',
    value: 'text-foreground',
  },
};

/**
 * KPICard - Compact KPI display for mobile swiper
 *
 * Features:
 * - Gradient background based on type
 * - Large value with trend indicator
 * - Touch-friendly size (min 44px height)
 * - Loading skeleton
 */
export function KPICard({
  label,
  value,
  trend,
  trendValue,
  trendPeriod,
  type = 'neutral',
  icon,
  loading = false,
  className,
  onClick,
}: KPICardProps) {
  const styles = typeStyles[type];

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const trendColor =
    trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-muted-foreground';

  if (loading) {
    return (
      <div
        className={cn(
          'flex flex-col justify-between p-4 rounded-xl',
          'bg-gradient-to-br from-muted to-muted/50',
          'border border-border',
          'min-h-[100px] min-w-[160px]',
          'animate-pulse',
          className
        )}
      >
        <div className="h-4 w-20 rounded bg-muted-foreground/20" />
        <div className="h-8 w-24 rounded bg-muted-foreground/20 mt-2" />
        <div className="h-3 w-16 rounded bg-muted-foreground/20 mt-2" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'flex flex-col justify-between p-4 rounded-xl',
        'bg-gradient-to-br',
        styles.gradient,
        'border',
        styles.border,
        'min-h-[100px] min-w-[160px]',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md active:scale-[0.98]',
        className
      )}
    >
      {/* Header with label and icon */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {icon && <div className={cn('flex-shrink-0', styles.icon)}>{icon}</div>}
      </div>

      {/* Value */}
      <div className={cn('text-2xl font-bold amount mt-1', styles.value)}>{value}</div>

      {/* Trend */}
      {(trend || trendValue !== undefined) && (
        <div className={cn('flex items-center gap-1 mt-1', trendColor)}>
          <TrendIcon className="h-3 w-3" />
          {trendValue !== undefined && (
            <span className="text-xs font-medium">{Math.abs(trendValue)}%</span>
          )}
          {trendPeriod && (
            <span className="text-xs text-muted-foreground">{trendPeriod}</span>
          )}
        </div>
      )}
    </div>
  );
}
