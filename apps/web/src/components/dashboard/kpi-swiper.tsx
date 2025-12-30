'use client';

import { cn } from '@moneio/ui';
import { useCallback, useRef, useState, useEffect } from 'react';

export interface KPISwiperProps {
  /** KPI cards to display */
  children: React.ReactNode;
  /** Number of items (for page indicators) */
  itemCount?: number;
  /** Show page indicators */
  showIndicators?: boolean;
  /** Gap between items */
  gap?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

const gapClasses = {
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
};

const gapPixels = {
  sm: 8,
  md: 12,
  lg: 16,
};

/**
 * KPISwiper - Horizontal scrolling container for KPI cards
 *
 * Features:
 * - CSS scroll-snap for smooth snapping
 * - Show 1.2 cards (peek effect) on mobile
 * - Page indicators (dots)
 * - Touch momentum scrolling
 * - Keyboard navigation (arrow keys)
 */
export function KPISwiper({
  children,
  itemCount = 0,
  showIndicators = true,
  gap = 'md',
  className,
}: KPISwiperProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Calculate active index based on scroll position
  const updateActiveIndex = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const itemWidth = container.firstElementChild?.clientWidth || 0;
    const gapWidth = gapPixels[gap];

    if (itemWidth > 0) {
      const index = Math.round(scrollLeft / (itemWidth + gapWidth));
      setActiveIndex(Math.min(index, itemCount - 1));
    }
  }, [gap, itemCount]);

  // Handle scroll event
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateActiveIndex();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [updateActiveIndex]);

  // Scroll to specific index
  const scrollToIndex = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container) return;

      const itemWidth = container.firstElementChild?.clientWidth || 0;
      const gapWidth = gapPixels[gap];

      container.scrollTo({
        left: index * (itemWidth + gapWidth),
        behavior: 'smooth',
      });
    },
    [gap]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && activeIndex > 0) {
        scrollToIndex(activeIndex - 1);
      } else if (e.key === 'ArrowRight' && activeIndex < itemCount - 1) {
        scrollToIndex(activeIndex + 1);
      }
    },
    [activeIndex, itemCount, scrollToIndex]
  );

  return (
    <div className={cn('relative', className)}>
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className={cn(
          'flex overflow-x-auto',
          'scrollbar-none', // Hide scrollbar
          '-mx-4 px-4', // Bleed edges for peek effect
          'snap-x snap-mandatory',
          'scroll-smooth',
          gapClasses[gap]
        )}
        style={{
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
          WebkitOverflowScrolling: 'touch', // Smooth iOS scrolling
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label="KPI metrics"
      >
        {/* Wrap each child for snap alignment */}
        {Array.isArray(children) ? (
          children.map((child, index) => (
            <div
              key={index}
              className={cn(
                'flex-shrink-0 snap-start',
                // Show ~1.2 cards on mobile (80% width)
                'w-[calc(80%-0.5rem)]',
                // Full width cards on larger screens
                'sm:w-auto'
              )}
            >
              {child}
            </div>
          ))
        ) : (
          <div className="flex-shrink-0 snap-start w-[calc(80%-0.5rem)] sm:w-auto">
            {children}
          </div>
        )}
      </div>

      {/* Page indicators */}
      {showIndicators && itemCount > 1 && (
        <div
          className="flex justify-center gap-1.5 mt-3 md:hidden"
          role="tablist"
          aria-label="KPI pages"
        >
          {Array.from({ length: itemCount }).map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToIndex(index)}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-200',
                'touch-target', // Ensure 44x44 touch area
                index === activeIndex
                  ? 'bg-primary w-4'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`Page ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * KPISwiperItem - Wrapper for items in KPISwiper
 * Use this for consistent sizing when not using KPICard
 */
export function KPISwiperItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex-shrink-0 snap-start',
        'w-[calc(80%-0.5rem)] sm:w-auto',
        className
      )}
    >
      {children}
    </div>
  );
}
