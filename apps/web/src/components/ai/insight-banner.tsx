'use client';

import { cn } from '@moneio/ui';
import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';

import type { AiInsight } from '@/lib/ai/insight-types';
import { sortInsights, getHighPriorityInsights } from '@/lib/ai/insight-types';

import { InsightCard } from './insight-card';

export interface InsightBannerProps {
  /** List of insights to display */
  insights: AiInsight[];
  /** Maximum insights to show when collapsed */
  collapsedCount?: number;
  /** Dismiss handler */
  onDismiss?: (id: string) => void;
  /** Snooze handler */
  onSnooze?: (id: string) => void;
  /** Additional className */
  className?: string;
}

/**
 * InsightBanner - Collapsible container for AI insights
 *
 * Features:
 * - Shows high-priority insights prominently
 * - Collapsible with "X more insights" indicator
 * - Sorted by priority then date
 * - Gradient background with AI accent
 */
export function InsightBanner({
  insights,
  collapsedCount = 1,
  onDismiss,
  onSnooze,
  className,
}: InsightBannerProps) {
  const containerRef = useFadeIn({ duration: 0.5, y: -10 });
  const [expanded, setExpanded] = useState(false);

  // Sort insights by priority
  const sortedInsights = useMemo(() => sortInsights(insights), [insights]);
  const highPriorityCount = useMemo(
    () => getHighPriorityInsights(insights).length,
    [insights]
  );

  // Determine which insights to show
  const visibleInsights = expanded
    ? sortedInsights
    : sortedInsights.slice(0, collapsedCount);
  const hiddenCount = sortedInsights.length - collapsedCount;
  const hasMore = hiddenCount > 0;

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (insights.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={cn(
        'rounded-xl border border-ai/20 overflow-hidden',
        'bg-gradient-to-br from-ai/10 via-primary/5 to-ai/10',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ai/10">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-ai animate-pulse-soft" />
          <span className="text-sm font-medium text-foreground">
            AI Insights
          </span>
          {highPriorityCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ai/20 text-ai">
              {highPriorityCount} important
            </span>
          )}
        </div>

        {hasMore && (
          <button
            onClick={toggleExpanded}
            className={cn(
              'flex items-center gap-1 text-sm text-muted-foreground',
              'hover:text-foreground transition-colors'
            )}
          >
            {expanded ? (
              <>
                <span>Show less</span>
                <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                <span>{hiddenCount} more</span>
                <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Insights list */}
      <div className="p-4 space-y-3">
        {visibleInsights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            variant="compact"
            onDismiss={onDismiss}
            onSnooze={onSnooze}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact variant for sidebar or smaller areas
 */
export function InsightBannerCompact({
  insights,
  onDismiss,
  className,
}: {
  insights: AiInsight[];
  onDismiss?: (id: string) => void;
  className?: string;
}) {
  const sortedInsights = useMemo(() => sortInsights(insights), [insights]);
  const topInsight = sortedInsights[0];

  if (!topInsight) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-ai/20 p-3',
        'bg-gradient-to-r from-ai/10 to-primary/5',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-ai flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {topInsight.title}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {topInsight.message}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(topInsight.id)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Dismiss"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {insights.length > 1 && (
        <div className="mt-2 text-xs text-ai">
          +{insights.length - 1} more insights
        </div>
      )}
    </div>
  );
}
