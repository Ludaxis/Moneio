'use client';

import { cn } from '@moneio/ui';
import { AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';

export interface ConfidenceBadgeProps {
  /** Confidence score (0-100) */
  confidence: number;
  /** Show percentage value */
  showValue?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show tooltip with explanation */
  showTooltip?: boolean;
  /** Additional className */
  className?: string;
}

type ConfidenceLevel = 'high' | 'medium' | 'low';

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 80) return 'high';
  if (confidence >= 50) return 'medium';
  return 'low';
}

const levelStyles: Record<ConfidenceLevel, { bg: string; text: string; icon: typeof CheckCircle }> =
  {
    high: {
      bg: 'bg-success/10',
      text: 'text-success',
      icon: CheckCircle,
    },
    medium: {
      bg: 'bg-warning/10',
      text: 'text-warning',
      icon: HelpCircle,
    },
    low: {
      bg: 'bg-danger/10',
      text: 'text-danger',
      icon: AlertCircle,
    },
  };

const sizeStyles = {
  sm: {
    badge: 'px-1.5 py-0.5 text-xs gap-1',
    icon: 'h-3 w-3',
  },
  md: {
    badge: 'px-2 py-1 text-xs gap-1.5',
    icon: 'h-3.5 w-3.5',
  },
  lg: {
    badge: 'px-2.5 py-1.5 text-sm gap-2',
    icon: 'h-4 w-4',
  },
};

/**
 * ConfidenceBadge - Visual indicator for AI confidence levels
 *
 * Features:
 * - Color-coded by confidence level (high/medium/low)
 * - Icon indicator
 * - Optional percentage display
 * - Multiple sizes
 */
export function ConfidenceBadge({
  confidence,
  showValue = true,
  size = 'md',
  showTooltip = true,
  className,
}: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(confidence);
  const styles = levelStyles[level];
  const sizeStyle = sizeStyles[size];
  const Icon = styles.icon;

  const levelLabel = {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
  }[level];

  const badge = (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        styles.bg,
        styles.text,
        sizeStyle.badge,
        className
      )}
      title={showTooltip ? `${levelLabel}: ${confidence}%` : undefined}
    >
      <Icon className={sizeStyle.icon} />
      {showValue && <span>{confidence}%</span>}
    </span>
  );

  return badge;
}

/**
 * Confidence meter - horizontal bar visualization
 */
export function ConfidenceMeter({
  confidence,
  showLabel = true,
  className,
}: {
  confidence: number;
  showLabel?: boolean;
  className?: string;
}) {
  const level = getConfidenceLevel(confidence);
  const styles = levelStyles[level];

  return (
    <div className={cn('space-y-1', className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <span className={styles.text}>{confidence}%</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', {
            'bg-success': level === 'high',
            'bg-warning': level === 'medium',
            'bg-danger': level === 'low',
          })}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Inline confidence indicator (dot)
 */
export function ConfidenceDot({
  confidence,
  className,
}: {
  confidence: number;
  className?: string;
}) {
  const level = getConfidenceLevel(confidence);

  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        {
          'bg-success': level === 'high',
          'bg-warning': level === 'medium',
          'bg-danger': level === 'low',
        },
        className
      )}
      title={`${confidence}% confidence`}
    />
  );
}
