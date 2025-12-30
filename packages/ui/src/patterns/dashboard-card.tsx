'use client';

import { ChevronRight, Expand } from 'lucide-react';
import * as React from 'react';

import { cn } from '../utils';

export interface DashboardCardProps {
  /** Card variant affecting size and padding */
  variant?: 'default' | 'compact';
  /** Card title */
  title?: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Action button or menu in header */
  headerAction?: React.ReactNode;
  /** Optional icon before title */
  icon?: React.ReactNode;
  /** Show expand button (for mobile chart expansion) */
  expandable?: boolean;
  /** Callback when expand is clicked */
  onExpand?: () => void;
  /** Show loading skeleton */
  loading?: boolean;
  /** Card content */
  children?: React.ReactNode;
  /** Footer content (links, actions) */
  footer?: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Click handler for the entire card */
  onClick?: () => void;
  /** Card href for navigation */
  href?: string;
}

/**
 * DashboardCard - Consistent card pattern for dashboard widgets
 *
 * Features:
 * - Default and compact variants for responsive layouts
 * - Header with title, subtitle, icon, and actions
 * - Loading skeleton that matches dimensions
 * - Optional expandable button for mobile
 * - Footer slot for links/actions
 */
export function DashboardCard({
  variant = 'default',
  title,
  subtitle,
  headerAction,
  icon,
  expandable,
  onExpand,
  loading,
  children,
  footer,
  className,
  onClick,
  href,
}: DashboardCardProps) {
  const isInteractive = onClick || href;

  const cardContent = (
    <>
      {/* Header */}
      {(title || headerAction || expandable) && (
        <div
          className={cn(
            'flex items-center justify-between',
            variant === 'compact' ? 'mb-2' : 'mb-4'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <div className="flex-shrink-0 text-muted-foreground">{icon}</div>
            )}
            <div className="min-w-0">
              {title && (
                <h3
                  className={cn(
                    'font-semibold text-foreground truncate',
                    variant === 'compact' ? 'text-sm' : 'text-base'
                  )}
                >
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {headerAction}
            {expandable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand?.();
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors touch-target"
                aria-label="Expand"
              >
                <Expand className="h-4 w-4" />
              </button>
            )}
            {isInteractive && !expandable && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <DashboardCardSkeleton variant={variant} />
      ) : (
        <div className="min-w-0">{children}</div>
      )}

      {/* Footer */}
      {footer && !loading && (
        <div
          className={cn(
            'border-t border-border',
            variant === 'compact' ? 'mt-2 pt-2' : 'mt-4 pt-4'
          )}
        >
          {footer}
        </div>
      )}
    </>
  );

  const cardClasses = cn(
    'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
    'transition-shadow duration-200',
    variant === 'compact' ? 'p-3' : 'p-6',
    isInteractive && 'cursor-pointer hover:shadow-md',
    className
  );

  if (href) {
    return (
      <a href={href} className={cardClasses}>
        {cardContent}
      </a>
    );
  }

  if (onClick) {
    return (
      <div onClick={onClick} role="button" tabIndex={0} className={cardClasses}>
        {cardContent}
      </div>
    );
  }

  return <div className={cardClasses}>{cardContent}</div>;
}

/**
 * Loading skeleton for DashboardCard
 */
export function DashboardCardSkeleton({
  variant = 'default',
}: {
  variant?: 'default' | 'compact';
}) {
  return (
    <div className="space-y-3 animate-pulse">
      <div
        className={cn(
          'rounded bg-muted',
          variant === 'compact' ? 'h-8 w-24' : 'h-10 w-32'
        )}
      />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
      </div>
    </div>
  );
}

/**
 * Header-only card variant for simpler use cases
 */
export interface DashboardCardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function DashboardCardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: DashboardCardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2 min-w-0">
        {icon && <div className="flex-shrink-0 text-muted-foreground">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
