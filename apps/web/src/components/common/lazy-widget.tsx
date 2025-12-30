'use client';

import { cn } from '@moneio/ui';
import { useEffect, useRef, useState, Suspense, type ComponentType } from 'react';

export interface LazyWidgetProps {
  /** Lazy-loaded component */
  children: React.ReactNode;
  /** Fallback component (skeleton) while loading */
  fallback?: React.ReactNode;
  /** Threshold for intersection observer (0-1) */
  threshold?: number;
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Minimum height to prevent layout shift */
  minHeight?: number | string;
  /** Additional className */
  className?: string;
  /** Disable lazy loading (for above-fold content) */
  eager?: boolean;
}

/**
 * LazyWidget - Lazy loading wrapper for dashboard widgets
 *
 * Uses IntersectionObserver to defer rendering of below-fold content.
 * Shows a skeleton placeholder until the widget enters the viewport.
 *
 * Features:
 * - IntersectionObserver-based visibility detection
 * - Configurable threshold and root margin
 * - Prevents layout shift with minHeight
 * - Suspense integration for async components
 */
export function LazyWidget({
  children,
  fallback,
  threshold = 0.1,
  rootMargin = '100px',
  minHeight,
  className,
  eager = false,
}: LazyWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(eager);
  const [hasRendered, setHasRendered] = useState(eager);

  useEffect(() => {
    if (eager || hasRendered) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasRendered(true);
          // Once rendered, stop observing
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    const currentRef = containerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [threshold, rootMargin, eager, hasRendered]);

  const defaultFallback = <WidgetSkeleton minHeight={minHeight} className={className} />;

  return (
    <div
      ref={containerRef}
      className={cn('content-visibility-auto', className)}
      style={{
        minHeight: minHeight,
        contentVisibility: isVisible ? 'visible' : 'auto',
        containIntrinsicSize: typeof minHeight === 'number' ? `auto ${minHeight}px` : minHeight,
      }}
    >
      {isVisible ? (
        <Suspense fallback={fallback || defaultFallback}>{children}</Suspense>
      ) : (
        fallback || defaultFallback
      )}
    </div>
  );
}

/**
 * Default widget skeleton placeholder
 */
export function WidgetSkeleton({
  minHeight,
  className,
}: {
  minHeight?: number | string;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-card p-4', 'animate-pulse', className)}
      style={{ minHeight }}
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-8 w-8 rounded bg-muted" />
      </div>

      {/* Content skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-4 w-1/2 rounded bg-muted" />
      </div>

      {/* Chart-like skeleton */}
      <div className="mt-4 flex items-end gap-2 h-24">
        {[40, 60, 80, 50, 70, 90, 65].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-muted" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Card skeleton for KPI cards
 */
export function KPICardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', 'animate-pulse', className)}>
      <div className="h-4 w-20 rounded bg-muted mb-2" />
      <div className="h-8 w-28 rounded bg-muted mb-1" />
      <div className="h-3 w-16 rounded bg-muted" />
    </div>
  );
}

/**
 * Chart skeleton for chart components
 */
export function ChartSkeleton({
  height = 200,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', 'animate-pulse', className)}>
      {/* Chart header */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-6 w-16 rounded bg-muted" />
          <div className="h-6 w-16 rounded bg-muted" />
        </div>
      </div>

      {/* Chart area */}
      <div className="relative rounded bg-muted" style={{ height: height - 60 }}>
        {/* Axis lines */}
        <div className="absolute inset-0 flex flex-col justify-between p-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-px w-full bg-border" />
          ))}
        </div>

        {/* Fake area chart shape */}
        <svg
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <path
            d="M0,80 L15,70 L30,75 L45,50 L60,55 L75,35 L90,40 L100,30 L100,100 L0,100 Z"
            fill="hsl(var(--muted-foreground) / 0.1)"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * Table/List skeleton
 */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', 'animate-pulse', className)}>
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-border">
        <div className="h-4 w-8 rounded bg-muted" />
        <div className="h-4 flex-1 rounded bg-muted" />
        <div className="h-4 w-20 rounded bg-muted" />
        <div className="h-4 w-16 rounded bg-muted" />
      </div>

      {/* Rows */}
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border-b border-border last:border-b-0">
          <div className="h-8 w-8 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-6 w-16 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * Higher-order component for lazy loading
 */
export function withLazyLoading<P extends object>(
  Component: ComponentType<P>,
  options?: Omit<LazyWidgetProps, 'children'>
) {
  const LazyComponent = (props: P) => (
    <LazyWidget {...options}>
      <Component {...props} />
    </LazyWidget>
  );

  LazyComponent.displayName = `LazyLoaded(${Component.displayName || Component.name || 'Component'})`;

  return LazyComponent;
}
