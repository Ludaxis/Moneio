'use client';

import { cn } from '@moneio/ui';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChartModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Chart content */
  children: React.ReactNode;
  /** Period options for navigation */
  periods?: Array<{
    id: string;
    label: string;
  }>;
  /** Currently selected period */
  selectedPeriod?: string;
  /** Period change handler */
  onPeriodChange?: (periodId: string) => void;
  /** Additional className for content area */
  className?: string;
}

/**
 * ChartModal - Full-screen chart viewer for mobile
 *
 * Features:
 * - Full-screen overlay on mobile
 * - Slide-in-bottom animation
 * - Swipe down to dismiss
 * - Period selector for navigation
 * - Handles body scroll lock
 */
export function ChartModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  periods,
  selectedPeriod,
  onPeriodChange,
  className,
}: ChartModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [touchStartY, setTouchStartY] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Swipe down to dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const deltaY = e.touches[0].clientY - touchStartY;
      // Only allow downward swipe
      if (deltaY > 0) {
        setTranslateY(deltaY);
      }
    },
    [isDragging, touchStartY]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);

    // If swiped down more than 100px, close the modal
    if (translateY > 100) {
      onClose();
    }
    setTranslateY(0);
  }, [translateY, onClose]);

  // Period navigation
  const currentPeriodIndex = periods?.findIndex((p) => p.id === selectedPeriod) ?? -1;
  const hasPrevPeriod = currentPeriodIndex > 0;
  const hasNextPeriod = currentPeriodIndex < (periods?.length ?? 0) - 1;

  const handlePrevPeriod = useCallback(() => {
    if (hasPrevPeriod && periods && onPeriodChange) {
      onPeriodChange(periods[currentPeriodIndex - 1].id);
    }
  }, [hasPrevPeriod, periods, currentPeriodIndex, onPeriodChange]);

  const handleNextPeriod = useCallback(() => {
    if (hasNextPeriod && periods && onPeriodChange) {
      onPeriodChange(periods[currentPeriodIndex + 1].id);
    }
  }, [hasNextPeriod, periods, currentPeriodIndex, onPeriodChange]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-modal bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={contentRef}
        className={cn(
          'fixed inset-x-0 bottom-0 z-modal',
          'bg-background rounded-t-2xl shadow-2xl',
          'max-h-[90vh] flex flex-col',
          'animate-slide-in-bottom',
          // Desktop: centered dialog
          'md:inset-x-auto md:left-1/2 md:-translate-x-1/2',
          'md:bottom-auto md:top-1/2 md:-translate-y-1/2',
          'md:max-w-2xl md:w-full md:rounded-2xl md:max-h-[80vh]'
        )}
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drag handle (mobile only) */}
        <div
          className="flex justify-center py-2 md:hidden cursor-grab"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 md:pt-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{title}</h2>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors touch-target"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Period navigation */}
        {periods && periods.length > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <button
              onClick={handlePrevPeriod}
              disabled={!hasPrevPeriod}
              className={cn(
                'rounded-lg p-2 transition-colors touch-target',
                hasPrevPeriod
                  ? 'text-foreground hover:bg-accent'
                  : 'text-muted-foreground/30 cursor-not-allowed'
              )}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <span className="text-sm font-medium text-foreground">
              {periods[currentPeriodIndex]?.label ?? 'Select period'}
            </span>

            <button
              onClick={handleNextPeriod}
              disabled={!hasNextPeriod}
              className={cn(
                'rounded-lg p-2 transition-colors touch-target',
                hasNextPeriod
                  ? 'text-foreground hover:bg-accent'
                  : 'text-muted-foreground/30 cursor-not-allowed'
              )}
              aria-label="Next period"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Chart content */}
        <div className={cn('flex-1 overflow-auto p-4', className)}>
          {children}
        </div>
      </div>
    </>
  );
}
