'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../utils.js';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
    period?: string;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ title, value, change, icon, className }: StatCardProps) {
  const TrendIcon = change?.type === 'increase'
    ? TrendingUp
    : change?.type === 'decrease'
    ? TrendingDown
    : Minus;

  const trendColor = change?.type === 'increase'
    ? 'text-success-600'
    : change?.type === 'decrease'
    ? 'text-danger-600'
    : 'text-neutral-500';

  return (
    <div className={cn(
      'rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800',
      className
    )}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{title}</p>
        {icon && (
          <div className="text-neutral-400 dark:text-neutral-500">
            {icon}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline">
        <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
          {value}
        </p>
        {change && (
          <div className={cn('ml-2 flex items-baseline text-sm', trendColor)}>
            <TrendIcon className="h-4 w-4 flex-shrink-0" />
            <span className="ml-1 font-medium">{Math.abs(change.value)}%</span>
            {change.period && (
              <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                {change.period}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
