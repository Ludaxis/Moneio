'use client';

import { cn } from '@moneio/ui';
import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  Lightbulb,
  AlertTriangle,
  Sparkles,
  AlertCircle,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

import type { AiInsight, InsightType } from '@/lib/ai/insight-types';

const iconMap = {
  opportunity: Lightbulb,
  alert: AlertTriangle,
  tip: Sparkles,
  anomaly: AlertCircle,
};

const styleMap: Record<InsightType, { bg: string; border: string; icon: string }> = {
  opportunity: {
    bg: 'bg-success/10 dark:bg-success/20',
    border: 'border-success/20 dark:border-success/30',
    icon: 'text-success',
  },
  alert: {
    bg: 'bg-warning/10 dark:bg-warning/20',
    border: 'border-warning/20 dark:border-warning/30',
    icon: 'text-warning',
  },
  tip: {
    bg: 'bg-ai/10 dark:bg-ai/20',
    border: 'border-ai/20 dark:border-ai/30',
    icon: 'text-ai',
  },
  anomaly: {
    bg: 'bg-danger/10 dark:bg-danger/20',
    border: 'border-danger/20 dark:border-danger/30',
    icon: 'text-danger',
  },
};

export interface InsightCardProps {
  /** Insight data */
  insight: AiInsight;
  /** Variant style */
  variant?: 'default' | 'compact';
  /** Dismiss handler */
  onDismiss?: (id: string) => void;
  /** Snooze handler */
  onSnooze?: (id: string) => void;
  /** Additional className */
  className?: string;
}

/**
 * InsightCard - Display a single AI insight
 *
 * Features:
 * - Icon and color based on type
 * - Metric with trend indicator
 * - Dismiss/snooze actions
 * - Optional CTA button
 * - GSAP fade-in animation
 */
export function InsightCard({
  insight,
  variant = 'default',
  onDismiss,
  onSnooze,
  className,
}: InsightCardProps) {
  const containerRef = useFadeIn({ duration: 0.4, y: 10 });
  const styles = styleMap[insight.type];
  const Icon = iconMap[insight.type];
  const TrendIcon =
    insight.metric?.direction === 'up'
      ? TrendingUp
      : insight.metric?.direction === 'down'
        ? TrendingDown
        : Minus;

  const isCompact = variant === 'compact';

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={cn(
        'relative rounded-lg border',
        styles.bg,
        styles.border,
        isCompact ? 'p-3' : 'p-4',
        className
      )}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex-shrink-0 rounded-full',
            styles.icon,
            isCompact ? 'mt-0.5' : 'p-2 bg-background/50'
          )}
        >
          <Icon className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn('font-medium text-foreground', isCompact ? 'text-sm' : 'text-base')}>
              {insight.title}
            </h4>

            {/* Actions */}
            {(insight.dismissible !== false || insight.snoozeable) && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {insight.snoozeable && onSnooze && (
                  <button
                    onClick={() => onSnooze(insight.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-background/50 hover:text-foreground transition-colors"
                    aria-label="Snooze"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                )}
                {insight.dismissible !== false && onDismiss && (
                  <button
                    onClick={() => onDismiss(insight.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-background/50 hover:text-foreground transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <p className={cn('text-muted-foreground mt-1', isCompact ? 'text-xs' : 'text-sm')}>
            {insight.message}
          </p>

          {/* Metric */}
          {insight.metric && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-lg font-bold amount text-foreground">
                {insight.metric.value}
              </span>
              {insight.metric.direction && (
                <TrendIcon
                  className={cn(
                    'h-4 w-4',
                    insight.metric.direction === 'up'
                      ? 'text-success'
                      : insight.metric.direction === 'down'
                        ? 'text-danger'
                        : 'text-muted-foreground'
                  )}
                />
              )}
              {insight.metric.label && (
                <span className="text-xs text-muted-foreground">{insight.metric.label}</span>
              )}
            </div>
          )}

          {/* Action */}
          {insight.action && (
            <div className="mt-3">
              {insight.action.href ? (
                <Link
                  href={insight.action.href}
                  className={cn(
                    'inline-flex items-center gap-1 text-sm font-medium',
                    'text-primary hover:text-primary/80 transition-colors'
                  )}
                >
                  {insight.action.label}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  onClick={insight.action.onClick}
                  className={cn(
                    'inline-flex items-center gap-1 text-sm font-medium',
                    'text-primary hover:text-primary/80 transition-colors'
                  )}
                >
                  {insight.action.label}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Confidence indicator (optional) */}
          {insight.confidence !== undefined && insight.confidence < 80 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Confidence: {insight.confidence}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
