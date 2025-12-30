'use client';

import { cn } from '@moneio/ui';
import { HelpCircle, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ConfidenceBadge, ConfidenceMeter } from './confidence-badge';

export interface ExplanationFactor {
  /** Factor name */
  name: string;
  /** Factor description */
  description: string;
  /** Impact on the result (positive, negative, neutral) */
  impact?: 'positive' | 'negative' | 'neutral';
  /** Weight/importance (0-100) */
  weight?: number;
}

export interface ExplanationPopoverProps {
  /** Title of the explanation */
  title: string;
  /** Main explanation text */
  explanation: string;
  /** Factors that influenced the result */
  factors?: ExplanationFactor[];
  /** Overall confidence score (0-100) */
  confidence?: number;
  /** Link to documentation */
  learnMoreUrl?: string;
  /** Button variant */
  variant?: 'icon' | 'text' | 'compact';
  /** Button size */
  size?: 'sm' | 'md';
  /** Additional className for trigger button */
  className?: string;
}

/**
 * ExplanationPopover - AI explanation display triggered by help button
 *
 * Features:
 * - Triggered by "?" or "Explain" button
 * - Shows AI reasoning in plain language
 * - Lists evidence/factors considered
 * - Confidence breakdown
 * - "Learn more" link to help docs
 */
export function ExplanationPopover({
  title,
  explanation,
  factors = [],
  confidence,
  learnMoreUrl,
  variant = 'icon',
  size = 'md',
  className,
}: ExplanationPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAllFactors, setShowAllFactors] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Calculate position when opening
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const popoverWidth = 320;
    const popoverHeight = 400; // Approximate max height

    // Default: position below and centered
    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;

    // Adjust if would go off right edge
    if (left + popoverWidth > viewportWidth - 16) {
      left = viewportWidth - popoverWidth - 16;
    }

    // Adjust if would go off left edge
    if (left < 16) {
      left = 16;
    }

    // If would go off bottom, position above
    if (top + popoverHeight > viewportHeight - 16) {
      top = rect.top - popoverHeight - 8;
    }

    // If would go off top, position below anyway
    if (top < 16) {
      top = rect.bottom + 8;
    }

    setPosition({ top, left });
  }, []);

  // Toggle popover
  const togglePopover = useCallback(() => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  }, [isOpen, updatePosition]);

  // Close popover
  const closePopover = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        closePopover();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closePopover]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!isOpen) return;

    const handleUpdate = () => updatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isOpen, updatePosition]);

  const sizeStyles = {
    sm: {
      button: 'h-6 w-6',
      icon: 'h-3.5 w-3.5',
      text: 'text-xs px-2 py-1',
    },
    md: {
      button: 'h-8 w-8',
      icon: 'h-4 w-4',
      text: 'text-sm px-3 py-1.5',
    },
  };

  const visibleFactors = showAllFactors ? factors : factors.slice(0, 3);
  const hasMoreFactors = factors.length > 3;

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={togglePopover}
        className={cn(
          'inline-flex items-center justify-center',
          'rounded-full',
          'text-muted-foreground hover:text-foreground',
          'hover:bg-accent transition-colors',
          'touch-target',
          variant === 'icon' && sizeStyles[size].button,
          variant === 'text' && sizeStyles[size].text,
          variant === 'compact' && 'h-5 w-5',
          className
        )}
        aria-label="Explain"
        aria-expanded={isOpen}
      >
        {variant === 'text' ? (
          <>
            <HelpCircle className={cn(sizeStyles[size].icon, 'mr-1')} />
            <span>Explain</span>
          </>
        ) : (
          <HelpCircle
            className={variant === 'compact' ? 'h-3 w-3' : sizeStyles[size].icon}
          />
        )}
      </button>

      {/* Popover */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className={cn(
              'fixed z-popover',
              'w-80 max-h-[min(400px,80vh)]',
              'bg-popover text-popover-foreground',
              'rounded-lg shadow-lg border border-border',
              'overflow-hidden',
              'animate-in fade-in-0 zoom-in-95',
              'duration-200'
            )}
            style={{ top: position.top, left: position.left }}
            role="dialog"
            aria-label={`Explanation: ${title}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 pb-2 border-b border-border">
              <div className="flex-1 pr-2">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {confidence !== undefined && (
                  <div className="flex items-center gap-2 mt-1">
                    <ConfidenceBadge confidence={confidence} size="sm" />
                  </div>
                )}
              </div>
              <button
                onClick={closePopover}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(min(400px,80vh)-120px)]">
              {/* Explanation */}
              <div className="p-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {explanation}
                </p>
              </div>

              {/* Confidence meter */}
              {confidence !== undefined && (
                <div className="px-4 pb-4">
                  <ConfidenceMeter confidence={confidence} />
                </div>
              )}

              {/* Factors */}
              {factors.length > 0 && (
                <div className="px-4 pb-4">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Contributing Factors
                  </h4>
                  <ul className="space-y-2">
                    {visibleFactors.map((factor, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm"
                      >
                        <span
                          className={cn(
                            'mt-1 h-2 w-2 rounded-full flex-shrink-0',
                            factor.impact === 'positive' && 'bg-success',
                            factor.impact === 'negative' && 'bg-danger',
                            factor.impact === 'neutral' && 'bg-muted-foreground',
                            !factor.impact && 'bg-muted-foreground'
                          )}
                        />
                        <div className="flex-1">
                          <span className="font-medium text-foreground">
                            {factor.name}
                          </span>
                          {factor.weight !== undefined && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({factor.weight}%)
                            </span>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {factor.description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Show more/less toggle */}
                  {hasMoreFactors && (
                    <button
                      onClick={() => setShowAllFactors(!showAllFactors)}
                      className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                    >
                      {showAllFactors ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Show {factors.length - 3} more
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {learnMoreUrl && (
              <div className="p-3 border-t border-border bg-muted/50">
                <a
                  href={learnMoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Learn more about this calculation
                </a>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Inline explanation trigger with tooltip-style popover
 */
export function InlineExplanation({
  label,
  explanation,
  className,
}: {
  label: string;
  explanation: string;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const showTooltip = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2,
      });
    }
    setIsVisible(true);
  }, []);

  const hideTooltip = useCallback(() => {
    setIsVisible(false);
  }, []);

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span>{label}</span>
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        tabIndex={0}
        className="inline-flex cursor-help"
      >
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
      </span>

      {isVisible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={cn(
              'fixed z-tooltip',
              'max-w-xs px-3 py-2',
              'bg-foreground text-background',
              'rounded-md shadow-lg',
              'text-xs',
              'animate-in fade-in-0 zoom-in-95 duration-150',
              '-translate-x-1/2'
            )}
            style={{ top: position.top, left: position.left }}
            role="tooltip"
          >
            {explanation}
            <div
              className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-foreground"
              aria-hidden="true"
            />
          </div>,
          document.body
        )}
    </span>
  );
}
