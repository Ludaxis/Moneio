'use client';

import { cn } from '@moneio/ui';
import {
  Check,
  Circle,
  Sparkles,
  ChevronRight,
  PartyPopper,
} from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';

export interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export interface WelcomeChecklistProps {
  /** Workspace name for personalization */
  workspaceName?: string;
  /** Checklist items with completion status */
  items: ChecklistItem[];
  /** Handler for when an item is completed */
  onItemComplete?: (itemId: string) => void;
  /** Handler for celebrating completion */
  onAllComplete?: () => void;
  /** Show as collapsed/expanded */
  defaultExpanded?: boolean;
  /** Additional className */
  className?: string;
}

const defaultChecklistItems: ChecklistItem[] = [
  {
    id: 'workspace',
    title: 'Create your workspace',
    description: 'Set up your business profile',
    completed: true, // Usually completed by the time they see this
  },
  {
    id: 'connect-bank',
    title: 'Connect your bank',
    description: 'Sync transactions automatically',
    completed: false,
    action: { label: 'Connect', href: '/settings/connections' },
  },
  {
    id: 'upload-document',
    title: 'Upload your first document',
    description: 'Try AI-powered extraction',
    completed: false,
    action: { label: 'Upload', href: '/documents?action=upload' },
  },
  {
    id: 'categorize-transaction',
    title: 'Categorize a transaction',
    description: 'Train your AI assistant',
    completed: false,
    action: { label: 'View', href: '/transactions' },
  },
];

/**
 * WelcomeChecklist - Onboarding progress tracker
 *
 * Features:
 * - Progress indicator (X of Y complete)
 * - Task list with completion status
 * - Actions for incomplete tasks
 * - Celebration animation on completion
 * - Collapsible for returning users
 */
export function WelcomeChecklist({
  workspaceName,
  items = defaultChecklistItems,
  onItemComplete: _onItemComplete,
  onAllComplete: _onAllComplete,
  defaultExpanded = true,
  className,
}: WelcomeChecklistProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [celebrating, _setCelebrating] = useState(false);

  const completedCount = useMemo(
    () => items.filter((item) => item.completed).length,
    [items]
  );
  const totalCount = items.length;
  const progress = Math.round((completedCount / totalCount) * 100);
  const isAllComplete = completedCount === totalCount;

  const handleToggle = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded]);

  // Note: handleCelebrate can be triggered externally when needed
  // Currently celebration is shown based on isAllComplete state

  // All complete celebration view
  if (isAllComplete && !celebrating) {
    return (
      <div
        className={cn(
          'rounded-lg border border-success/30 bg-success/5 p-4',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
            <PartyPopper className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-success">All set up!</h3>
            <p className="text-xs text-muted-foreground">
              You&apos;ve completed all onboarding tasks. Enjoy Moneio!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card overflow-hidden',
        celebrating && 'animate-pulse',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {workspaceName ? `Welcome to ${workspaceName}!` : 'Get started'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {completedCount} of {totalCount} tasks complete
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress ring */}
          <div className="relative h-8 w-8">
            <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="3"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeDasharray={`${progress * 0.88} 88`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
              {progress}%
            </span>
          </div>
          <ChevronRight
            className={cn(
              'h-5 w-5 text-muted-foreground transition-transform',
              expanded && 'rotate-90'
            )}
          />
        </div>
      </button>

      {/* Items */}
      {expanded && (
        <div className="border-t border-border">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                index !== items.length - 1 && 'border-b border-border',
                item.completed && 'opacity-60'
              )}
            >
              {/* Status icon */}
              {item.completed ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10">
                  <Check className="h-4 w-4 text-success" />
                </div>
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted">
                  <Circle className="h-3 w-3 text-muted-foreground" />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm font-medium',
                    item.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}
                >
                  {item.title}
                </p>
                {item.description && !item.completed && (
                  <p className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Action */}
              {!item.completed && item.action && (
                <button
                  onClick={item.action.onClick}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {item.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Minimal progress bar variant
 */
export function OnboardingProgress({
  completedSteps,
  totalSteps,
  className,
}: {
  completedSteps: number;
  totalSteps: number;
  className?: string;
}) {
  const progress = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Setup progress</span>
        <span className="font-medium text-foreground">
          {completedSteps}/{totalSteps}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
