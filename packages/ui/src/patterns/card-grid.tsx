'use client';

import * as React from 'react';

import { cn } from '../utils';

export interface CardGridProps {
  /** Number of columns at different breakpoints */
  columns?: {
    default?: 1 | 2 | 3 | 4;
    sm?: 1 | 2 | 3 | 4;
    md?: 1 | 2 | 3 | 4;
    lg?: 1 | 2 | 3 | 4;
    xl?: 1 | 2 | 3 | 4;
  };
  /** Gap between items */
  gap?: 'sm' | 'md' | 'lg';
  /** Grid children */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

const columnClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const smColumnClasses = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

const mdColumnClasses = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

const lgColumnClasses = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

const xlColumnClasses = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
};

const gapClasses = {
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
};

/**
 * CardGrid - Responsive grid wrapper for dashboard cards
 *
 * Provides consistent responsive behavior across the dashboard.
 * Default: 1 column on mobile, 2 on tablet, 4 on desktop.
 */
export function CardGrid({
  columns = { default: 1, sm: 2, lg: 4 },
  gap = 'md',
  children,
  className,
}: CardGridProps) {
  return (
    <div
      className={cn(
        'grid',
        columns.default && columnClasses[columns.default],
        columns.sm && smColumnClasses[columns.sm],
        columns.md && mdColumnClasses[columns.md],
        columns.lg && lgColumnClasses[columns.lg],
        columns.xl && xlColumnClasses[columns.xl],
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * CardGridItem - Wrapper for grid items with span support
 */
export interface CardGridItemProps {
  /** Column span at different breakpoints */
  span?: {
    default?: 1 | 2 | 3 | 4;
    sm?: 1 | 2 | 3 | 4;
    md?: 1 | 2 | 3 | 4;
    lg?: 1 | 2 | 3 | 4;
  };
  /** Row span (for tall cards) */
  rowSpan?: 1 | 2;
  children: React.ReactNode;
  className?: string;
}

const spanClasses = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
};

const smSpanClasses = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
};

const mdSpanClasses = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
};

const lgSpanClasses = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
};

const rowSpanClasses = {
  1: 'row-span-1',
  2: 'row-span-2',
};

export function CardGridItem({
  span,
  rowSpan = 1,
  children,
  className,
}: CardGridItemProps) {
  return (
    <div
      className={cn(
        span?.default && spanClasses[span.default],
        span?.sm && smSpanClasses[span.sm],
        span?.md && mdSpanClasses[span.md],
        span?.lg && lgSpanClasses[span.lg],
        rowSpanClasses[rowSpan],
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * TwoColumnLayout - Common dashboard layout with main content and sidebar
 */
export interface TwoColumnLayoutProps {
  /** Main content (left/top on mobile) */
  main: React.ReactNode;
  /** Sidebar content (right/bottom on mobile) */
  sidebar: React.ReactNode;
  /** Sidebar position */
  sidebarPosition?: 'left' | 'right';
  /** Gap between columns */
  gap?: 'sm' | 'md' | 'lg';
  /** Reverse order on mobile (sidebar first) */
  reverseMobile?: boolean;
  className?: string;
}

export function TwoColumnLayout({
  main,
  sidebar,
  sidebarPosition = 'right',
  gap = 'lg',
  reverseMobile = false,
  className,
}: TwoColumnLayoutProps) {
  const isLeftSidebar = sidebarPosition === 'left';

  return (
    <div
      className={cn(
        'grid grid-cols-1 lg:grid-cols-3',
        gapClasses[gap],
        className
      )}
    >
      {/* Main content - 2/3 width on desktop */}
      <div
        className={cn(
          'lg:col-span-2',
          isLeftSidebar && 'lg:order-2',
          reverseMobile && 'order-2 lg:order-none'
        )}
      >
        {main}
      </div>

      {/* Sidebar - 1/3 width on desktop */}
      <div
        className={cn(
          'lg:col-span-1',
          isLeftSidebar && 'lg:order-1',
          reverseMobile && 'order-1 lg:order-none'
        )}
      >
        {sidebar}
      </div>
    </div>
  );
}
