'use client';

import { cn } from '@moneio/ui';
import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { Wallet, CreditCard, PiggyBank, Landmark } from 'lucide-react';
import type React from 'react';

import { TrendBadge } from './trend-badge';

type BalanceType = 'cash' | 'card' | 'savings' | 'bank';

interface BalanceCardProps {
  type: BalanceType;
  label: string;
  value: string;
  lastUpdated?: string;
  comparison?: {
    period: string;
    percentage: number;
    direction: 'up' | 'down' | 'stable';
  };
  loading?: boolean;
  delay?: number;
}

/**
 * Icon configurations with themed background colors
 */
const iconConfig: Record<
  BalanceType,
  {
    icon: React.ReactNode;
    bg: string;
    color: string;
  }
> = {
  cash: {
    icon: <Wallet className="h-5 w-5" />,
    bg: 'bg-success-50 dark:bg-success-950',
    color: 'text-success-600 dark:text-success-400',
  },
  bank: {
    icon: <Landmark className="h-5 w-5" />,
    bg: 'bg-primary-50 dark:bg-primary-950',
    color: 'text-primary-600 dark:text-primary-400',
  },
  card: {
    icon: <CreditCard className="h-5 w-5" />,
    bg: 'bg-rose-50 dark:bg-rose-950',
    color: 'text-rose-600 dark:text-rose-400',
  },
  savings: {
    icon: <PiggyBank className="h-5 w-5" />,
    bg: 'bg-violet-50 dark:bg-violet-950',
    color: 'text-violet-600 dark:text-violet-400',
  },
};

export function BalanceCard({
  type,
  label,
  value,
  lastUpdated,
  comparison,
  loading,
  delay = 0,
}: BalanceCardProps) {
  const containerRef = useFadeIn({
    duration: 0.5,
    delay,
    y: 20,
  }) as React.RefObject<HTMLDivElement>;

  const config = iconConfig[type];

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-8 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/20"
    >
      <div className="flex items-start gap-4">
        {/* Icon container */}
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
            config.bg
          )}
        >
          <span className={config.color}>{config.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-foreground tracking-tight mt-0.5">
            {value}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {lastUpdated && <p className="text-xs text-muted-foreground">{lastUpdated}</p>}
            {comparison && (
              <TrendBadge
                percentage={comparison.percentage}
                direction={comparison.direction}
                period={comparison.period}
                size="sm"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
