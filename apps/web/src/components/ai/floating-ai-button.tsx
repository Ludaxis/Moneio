'use client';

import { cn } from '@moneio/ui';
import { Sparkles, X } from 'lucide-react';
import { useState, useCallback } from 'react';

export interface FloatingAIButtonProps {
  /** Number of pending insights (shows badge) */
  insightCount?: number;
  /** Whether the AI chat is currently open */
  isOpen?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Position on screen */
  position?: 'bottom-right' | 'bottom-left';
  /** Hide on larger screens */
  mobileOnly?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * FloatingAIButton - FAB for quick AI access
 *
 * Features:
 * - Pulsing animation when insights available
 * - Badge showing insight count
 * - Toggles between sparkle and X icon
 * - Positioned above bottom nav on mobile
 */
export function FloatingAIButton({
  insightCount = 0,
  isOpen = false,
  onClick,
  position = 'bottom-right',
  mobileOnly = false,
  className,
}: FloatingAIButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = useCallback(() => {
    setIsPressed(true);
    // Reset after animation
    setTimeout(() => setIsPressed(false), 150);
    onClick?.();
  }, [onClick]);

  const positionClasses = {
    'bottom-right': 'right-4 bottom-[calc(var(--bottom-nav-height)+1rem)] md:bottom-6',
    'bottom-left': 'left-4 bottom-[calc(var(--bottom-nav-height)+1rem)] md:bottom-6',
  };

  return (
    <button
      onClick={handlePress}
      className={cn(
        'fixed z-fixed',
        positionClasses[position],
        // Size
        'h-14 w-14',
        // Shape and style
        'rounded-full shadow-lg',
        'flex items-center justify-center',
        // Colors
        isOpen
          ? 'bg-muted text-muted-foreground'
          : 'bg-gradient-to-br from-ai to-primary text-white',
        // Interactions
        'transition-all duration-200',
        'hover:shadow-xl hover:scale-105',
        'active:scale-95',
        isPressed && 'scale-95',
        // Pulsing when has insights
        !isOpen && insightCount > 0 && 'animate-pulse-soft',
        // Mobile only
        mobileOnly && 'md:hidden',
        className
      )}
      aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
    >
      {/* Icon */}
      {isOpen ? (
        <X className="h-6 w-6" />
      ) : (
        <Sparkles className="h-6 w-6" />
      )}

      {/* Badge */}
      {!isOpen && insightCount > 0 && (
        <span
          className={cn(
            'absolute -top-1 -right-1',
            'h-5 w-5 rounded-full',
            'bg-danger text-danger-foreground',
            'flex items-center justify-center',
            'text-xs font-bold',
            'border-2 border-background'
          )}
        >
          {insightCount > 9 ? '9+' : insightCount}
        </span>
      )}
    </button>
  );
}

/**
 * Mini FAB variant for inline use
 */
export function MiniAIButton({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center',
        'h-8 w-8 rounded-full',
        'bg-ai/10 text-ai',
        'hover:bg-ai/20 transition-colors',
        'touch-target',
        className
      )}
      aria-label="Ask AI"
    >
      <Sparkles className="h-4 w-4" />
    </button>
  );
}
