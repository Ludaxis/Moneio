'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Wallet,
  CreditCard,
  PiggyBank,
  Landmark,
} from 'lucide-react';
import type React from 'react';

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

const illustrations: Record<BalanceType, React.ReactNode> = {
  cash: (
    <svg viewBox="0 0 80 60" className="h-16 w-20">
      <rect
        x="5"
        y="15"
        width="60"
        height="35"
        rx="4"
        fill="#E8F5E9"
        stroke="#4CAF50"
        strokeWidth="2"
      />
      <rect
        x="15"
        y="10"
        width="60"
        height="35"
        rx="4"
        fill="#C8E6C9"
        stroke="#66BB6A"
        strokeWidth="2"
      />
      <circle cx="45" cy="27" r="10" fill="#81C784" />
      <text x="45" y="31" textAnchor="middle" fontSize="10" fill="#2E7D32" fontWeight="bold">
        $
      </text>
      <path d="M20 20 L25 25 L20 30" stroke="#66BB6A" strokeWidth="2" fill="none" />
      <path d="M70 20 L65 25 L70 30" stroke="#66BB6A" strokeWidth="2" fill="none" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 80 60" className="h-16 w-20">
      <rect
        x="10"
        y="12"
        width="60"
        height="38"
        rx="4"
        fill="#E3F2FD"
        stroke="#2196F3"
        strokeWidth="2"
      />
      <rect x="10" y="22" width="60" height="8" fill="#1976D2" />
      <rect x="16" y="36" width="20" height="6" rx="2" fill="#BBDEFB" />
      <rect x="44" y="36" width="20" height="6" rx="2" fill="#BBDEFB" />
      <circle cx="58" cy="18" r="4" fill="#FFC107" opacity="0.8" />
      <circle cx="52" cy="18" r="4" fill="#FF9800" opacity="0.8" />
    </svg>
  ),
  savings: (
    <svg viewBox="0 0 80 60" className="h-16 w-20">
      <ellipse cx="40" cy="48" rx="25" ry="6" fill="#FCE4EC" />
      <path
        d="M20 20 C20 10, 60 10, 60 20 L60 42 C60 48, 20 48, 20 42 Z"
        fill="#F8BBD9"
        stroke="#EC407A"
        strokeWidth="2"
      />
      <rect x="35" y="8" width="10" height="8" rx="2" fill="#EC407A" />
      <ellipse cx="40" cy="20" rx="20" ry="6" fill="#F48FB1" />
      <circle cx="32" cy="30" r="2" fill="#EC407A" />
      <circle cx="48" cy="30" r="2" fill="#EC407A" />
    </svg>
  ),
  bank: (
    <svg viewBox="0 0 80 60" className="h-16 w-20">
      <polygon points="40,8 70,24 10,24" fill="#E8EAF6" stroke="#5C6BC0" strokeWidth="2" />
      <rect x="15" y="24" width="50" height="4" fill="#7986CB" />
      <rect x="20" y="28" width="6" height="20" fill="#9FA8DA" />
      <rect x="32" y="28" width="6" height="20" fill="#9FA8DA" />
      <rect x="44" y="28" width="6" height="20" fill="#9FA8DA" />
      <rect x="56" y="28" width="6" height="20" fill="#9FA8DA" />
      <rect x="12" y="48" width="56" height="6" fill="#7986CB" />
    </svg>
  ),
};

const icons: Record<BalanceType, React.ReactNode> = {
  cash: <Wallet className="h-5 w-5" />,
  card: <CreditCard className="h-5 w-5" />,
  savings: <PiggyBank className="h-5 w-5" />,
  bank: <Landmark className="h-5 w-5" />,
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

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-10 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-16 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            {icons[type]}
            <span className="text-sm font-medium">{label}</span>
          </div>
          <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">{value}</p>
          {lastUpdated && <p className="text-xs text-muted-foreground">{lastUpdated}</p>}
          {comparison && (
            <div className="flex items-center gap-1.5 pt-2">
              {comparison.direction === 'up' && (
                <div className="flex items-center gap-1 text-success-600">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">+{comparison.percentage}%</span>
                </div>
              )}
              {comparison.direction === 'down' && (
                <div className="flex items-center gap-1 text-danger-600">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-sm font-medium">-{comparison.percentage}%</span>
                </div>
              )}
              {comparison.direction === 'stable' && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Minus className="h-4 w-4" />
                  <span className="text-sm font-medium">0%</span>
                </div>
              )}
              <span className="text-xs text-muted-foreground">{comparison.period}</span>
            </div>
          )}
        </div>
        <div className="opacity-80 group-hover:opacity-100 transition-opacity">
          {illustrations[type]}
        </div>
      </div>
    </div>
  );
}
