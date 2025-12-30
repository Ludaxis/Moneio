'use client';

import { cn } from '@moneio/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TouchTooltipProps {
  /** Tooltip content */
  children: React.ReactNode;
  /** Whether tooltip is visible */
  visible: boolean;
  /** X position (relative to chart container) */
  x: number;
  /** Y position (relative to chart container) */
  y: number;
  /** Container element ref for positioning */
  containerRef: React.RefObject<HTMLElement>;
  /** Close handler */
  onClose?: () => void;
  /** Additional className */
  className?: string;
}

const TOOLTIP_OFFSET = 12;
const VIEWPORT_PADDING = 16;

/**
 * TouchTooltip - Mobile-friendly tooltip for charts
 *
 * Features:
 * - Larger touch target (min 44x44px)
 * - Persistent on tap (not hover)
 * - Smart positioning to avoid thumb
 * - Tap outside to dismiss
 * - Renders in portal to avoid clipping
 */
export function TouchTooltip({
  children,
  visible,
  x,
  y,
  containerRef,
  onClose,
  className,
}: TouchTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  // Handle SSR - only render portal on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position to keep tooltip in viewport
  useEffect(() => {
    if (!visible || !containerRef.current || !tooltipRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Convert chart-relative coords to viewport coords
    let tooltipX = containerRect.left + x;
    let tooltipY = containerRect.top + y;

    // Default: position above and to the right of touch point
    tooltipX += TOOLTIP_OFFSET;
    tooltipY -= tooltipRect.height + TOOLTIP_OFFSET;

    // If tooltip would go off right edge, flip to left
    if (tooltipX + tooltipRect.width > viewportWidth - VIEWPORT_PADDING) {
      tooltipX = containerRect.left + x - tooltipRect.width - TOOLTIP_OFFSET;
    }

    // If tooltip would go off left edge, align to left padding
    if (tooltipX < VIEWPORT_PADDING) {
      tooltipX = VIEWPORT_PADDING;
    }

    // If tooltip would go off top, position below touch point
    if (tooltipY < VIEWPORT_PADDING) {
      tooltipY = containerRect.top + y + TOOLTIP_OFFSET;
    }

    // If tooltip would go off bottom, clamp to bottom padding
    if (tooltipY + tooltipRect.height > viewportHeight - VIEWPORT_PADDING) {
      tooltipY = viewportHeight - VIEWPORT_PADDING - tooltipRect.height;
    }

    setPosition({ x: tooltipX, y: tooltipY });
  }, [visible, x, y, containerRef]);

  // Close on tap outside
  useEffect(() => {
    if (!visible || !onClose) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay adding listener to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [visible, onClose]);

  if (!mounted || !visible) return null;

  const tooltip = (
    <div
      ref={tooltipRef}
      className={cn(
        'fixed z-tooltip',
        'bg-popover text-popover-foreground',
        'border border-border rounded-lg shadow-lg',
        'p-3 min-w-[120px]',
        'animate-scale-in',
        className
      )}
      style={{
        left: position.x,
        top: position.y,
      }}
      role="tooltip"
    >
      {children}
    </div>
  );

  // Render in portal to avoid clipping
  return createPortal(tooltip, document.body);
}

/**
 * Custom tooltip content component for charts
 */
export interface ChartTooltipContentProps {
  /** Label (e.g., month name) */
  label?: string;
  /** Data items to display */
  items: Array<{
    name: string;
    value: string;
    color?: string;
  }>;
  /** Additional footer content */
  footer?: React.ReactNode;
}

export function ChartTooltipContent({ label, items, footer }: ChartTooltipContentProps) {
  return (
    <div className="space-y-2">
      {label && <div className="text-xs font-medium text-muted-foreground">{label}</div>}
      <div className="space-y-1">
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {item.color && (
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              )}
              <span className="text-sm text-muted-foreground">{item.name}</span>
            </div>
            <span className="text-sm font-medium amount">{item.value}</span>
          </div>
        ))}
      </div>
      {footer && (
        <div className="pt-2 border-t border-border text-xs text-muted-foreground">{footer}</div>
      )}
    </div>
  );
}

/**
 * Hook to manage touch tooltip state
 */
export function useTouchTooltip() {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    payload: unknown;
  }>({
    visible: false,
    x: 0,
    y: 0,
    payload: null,
  });

  const showTooltip = useCallback((x: number, y: number, payload: unknown) => {
    setTooltip({ visible: true, x, y, payload });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleChartClick = useCallback(
    (e: { activeCoordinate?: { x: number; y: number }; activePayload?: unknown[] }) => {
      if (e.activeCoordinate && e.activePayload) {
        showTooltip(e.activeCoordinate.x, e.activeCoordinate.y, e.activePayload);
      }
    },
    [showTooltip]
  );

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    handleChartClick,
  };
}
