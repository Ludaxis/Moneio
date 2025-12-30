'use client';

import * as React from 'react';
import { useCallback, useRef, useState, useEffect } from 'react';

import { cn } from '../utils';

export interface SwipeAction {
  /** Action identifier */
  id: string;
  /** Action label */
  label: string;
  /** Action icon */
  icon?: React.ReactNode;
  /** Background color class */
  color?: 'primary' | 'success' | 'warning' | 'danger';
  /** Action handler */
  onClick: () => void;
}

export interface SwipeableRowProps {
  /** Row content */
  children: React.ReactNode;
  /** Actions revealed on swipe left */
  leftActions?: SwipeAction[];
  /** Actions revealed on swipe right */
  rightActions?: SwipeAction[];
  /** Disable swipe functionality */
  disabled?: boolean;
  /** Callback when swipe completes */
  onSwipeComplete?: (direction: 'left' | 'right') => void;
  /** Additional className */
  className?: string;
}

const colorClasses = {
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-destructive text-destructive-foreground',
};

const ACTION_WIDTH = 80; // Width of each action button
const SWIPE_THRESHOLD = 50; // Minimum distance to trigger action reveal
const VELOCITY_THRESHOLD = 0.3; // Velocity threshold for quick swipes

/**
 * SwipeableRow - Touch-friendly row with swipe-to-reveal actions
 *
 * Features:
 * - Swipe left/right to reveal actions
 * - Momentum-based swiping
 * - Auto-close after action
 * - Haptic feedback (when supported)
 * - Keyboard accessible fallback
 */
export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  disabled = false,
  onSwipeComplete,
  className,
}: SwipeableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startTranslateRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastXRef = useRef(0);

  const leftActionsWidth = leftActions.length * ACTION_WIDTH;
  const rightActionsWidth = rightActions.length * ACTION_WIDTH;

  // Reset position
  const resetPosition = useCallback(() => {
    setTranslateX(0);
  }, []);

  // Handle touch/pointer start
  const handleStart = useCallback(
    (clientX: number) => {
      if (disabled) return;
      setIsDragging(true);
      startXRef.current = clientX;
      startTranslateRef.current = translateX;
      lastXRef.current = clientX;
      lastTimeRef.current = Date.now();
      velocityRef.current = 0;
    },
    [disabled, translateX]
  );

  // Handle touch/pointer move
  const handleMove = useCallback(
    (clientX: number) => {
      if (!isDragging || disabled) return;

      const deltaX = clientX - startXRef.current;
      let newTranslate = startTranslateRef.current + deltaX;

      // Calculate velocity
      const now = Date.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        velocityRef.current = (clientX - lastXRef.current) / dt;
      }
      lastXRef.current = clientX;
      lastTimeRef.current = now;

      // Limit swipe distance
      if (rightActions.length > 0 && newTranslate < 0) {
        newTranslate = Math.max(newTranslate, -rightActionsWidth);
      } else if (leftActions.length > 0 && newTranslate > 0) {
        newTranslate = Math.min(newTranslate, leftActionsWidth);
      } else if (
        (rightActions.length === 0 && newTranslate < 0) ||
        (leftActions.length === 0 && newTranslate > 0)
      ) {
        // Apply resistance when no actions in that direction
        newTranslate = startTranslateRef.current + deltaX * 0.2;
      }

      setTranslateX(newTranslate);
    },
    [isDragging, disabled, rightActions.length, leftActions.length, rightActionsWidth, leftActionsWidth]
  );

  // Handle touch/pointer end
  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const velocity = velocityRef.current;
    const isQuickSwipe = Math.abs(velocity) > VELOCITY_THRESHOLD;

    // Determine final position based on distance and velocity
    if (translateX < -SWIPE_THRESHOLD || (isQuickSwipe && velocity < 0)) {
      // Reveal right actions
      if (rightActions.length > 0) {
        setTranslateX(-rightActionsWidth);
        onSwipeComplete?.('left');
        // Haptic feedback
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }
      } else {
        resetPosition();
      }
    } else if (translateX > SWIPE_THRESHOLD || (isQuickSwipe && velocity > 0)) {
      // Reveal left actions
      if (leftActions.length > 0) {
        setTranslateX(leftActionsWidth);
        onSwipeComplete?.('right');
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }
      } else {
        resetPosition();
      }
    } else {
      resetPosition();
    }
  }, [isDragging, translateX, rightActions.length, leftActions.length, rightActionsWidth, leftActionsWidth, onSwipeComplete, resetPosition]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        translateX !== 0
      ) {
        resetPosition();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [translateX, resetPosition]);

  // Action click handler
  const handleActionClick = useCallback(
    (action: SwipeAction) => {
      action.onClick();
      resetPosition();
    },
    [resetPosition]
  );

  const hasActions = leftActions.length > 0 || rightActions.length > 0;

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', className)}
    >
      {/* Left actions (revealed on swipe right) */}
      {leftActions.length > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{ width: leftActionsWidth }}
        >
          {leftActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              className={cn(
                'flex flex-col items-center justify-center h-full px-4',
                'text-xs font-medium',
                'touch-target',
                colorClasses[action.color || 'primary']
              )}
              style={{ width: ACTION_WIDTH }}
            >
              {action.icon && <span className="mb-1">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Right actions (revealed on swipe left) */}
      {rightActions.length > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex"
          style={{ width: rightActionsWidth }}
        >
          {rightActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              className={cn(
                'flex flex-col items-center justify-center h-full px-4',
                'text-xs font-medium',
                'touch-target',
                colorClasses[action.color || 'primary']
              )}
              style={{ width: ACTION_WIDTH }}
            >
              {action.icon && <span className="mb-1">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      <div
        ref={contentRef}
        className={cn(
          'relative bg-card',
          isDragging ? 'cursor-grabbing' : hasActions && 'cursor-grab'
        )}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => isDragging && handleMove(e.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
      >
        {children}
      </div>
    </div>
  );
}
