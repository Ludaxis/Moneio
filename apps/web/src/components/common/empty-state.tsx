'use client';

import { cn } from '@moneio/ui';
import { FileText, Receipt, CreditCard, Building2, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface EmptyStateProps {
  /** Icon to display */
  icon?: LucideIcon;
  /** Title text */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'demo';
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

const sizeStyles = {
  sm: {
    container: 'py-6 px-4',
    icon: 'h-10 w-10',
    iconWrapper: 'h-16 w-16',
    title: 'text-sm font-medium',
    description: 'text-xs',
    button: 'text-xs px-3 py-1.5',
  },
  md: {
    container: 'py-8 px-6',
    icon: 'h-12 w-12',
    iconWrapper: 'h-20 w-20',
    title: 'text-base font-semibold',
    description: 'text-sm',
    button: 'text-sm px-4 py-2',
  },
  lg: {
    container: 'py-12 px-8',
    icon: 'h-16 w-16',
    iconWrapper: 'h-24 w-24',
    title: 'text-lg font-semibold',
    description: 'text-base',
    button: 'text-sm px-5 py-2.5',
  },
};

/**
 * EmptyState - Reusable empty state component
 *
 * Used when a section has no data to display.
 * Provides clear messaging and actions to help users get started.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
}: EmptyStateProps) {
  const styles = sizeStyles[size];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        styles.container,
        className
      )}
    >
      {/* Icon */}
      {Icon && (
        <div
          className={cn(
            'mb-4 flex items-center justify-center rounded-full bg-muted',
            styles.iconWrapper
          )}
        >
          <Icon className={cn('text-muted-foreground', styles.icon)} />
        </div>
      )}

      {/* Text */}
      <h3 className={cn('text-foreground', styles.title)}>{title}</h3>
      {description && (
        <p className={cn('mt-1 max-w-sm text-muted-foreground', styles.description)}>
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
                styles.button,
                action.variant === 'demo' && [
                  'bg-gradient-to-r from-ai to-primary text-white',
                  'hover:opacity-90',
                ],
                action.variant === 'secondary' && [
                  'bg-secondary text-secondary-foreground',
                  'hover:bg-secondary/80',
                ],
                (!action.variant || action.variant === 'primary') && [
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                ]
              )}
            >
              {action.variant === 'demo' && <Sparkles className="h-4 w-4" />}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
                'text-muted-foreground hover:text-foreground',
                styles.button
              )}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pre-configured empty states for common use cases
 */

export function NoDocumentsEmpty({
  onUpload,
  onDemo,
  size = 'md',
}: {
  onUpload?: () => void;
  onDemo?: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useTranslations('emptyStates');
  return (
    <EmptyState
      icon={FileText}
      title={t('noDocuments')}
      description={t('noDocumentsDesc')}
      action={
        onUpload
          ? { label: t('uploadDocument'), onClick: onUpload, variant: 'primary' }
          : onDemo
            ? { label: t('tryDemoMode'), onClick: onDemo, variant: 'demo' }
            : undefined
      }
      secondaryAction={onUpload && onDemo ? { label: t('tryDemo'), onClick: onDemo } : undefined}
      size={size}
    />
  );
}

export function NoInvoicesEmpty({
  onCreate,
  onDemo,
  size = 'md',
}: {
  onCreate?: () => void;
  onDemo?: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useTranslations('emptyStates');
  return (
    <EmptyState
      icon={Receipt}
      title={t('noInvoices')}
      description={t('noInvoicesDesc')}
      action={
        onCreate
          ? { label: t('createInvoice'), onClick: onCreate, variant: 'primary' }
          : onDemo
            ? { label: t('tryDemoMode'), onClick: onDemo, variant: 'demo' }
            : undefined
      }
      secondaryAction={onCreate && onDemo ? { label: t('tryDemo'), onClick: onDemo } : undefined}
      size={size}
    />
  );
}

export function NoTransactionsEmpty({
  onConnect,
  onDemo,
  size = 'md',
}: {
  onConnect?: () => void;
  onDemo?: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useTranslations('emptyStates');
  return (
    <EmptyState
      icon={CreditCard}
      title={t('noTransactions')}
      description={t('noTransactionsDesc')}
      action={
        onConnect
          ? { label: t('connectBank'), onClick: onConnect, variant: 'primary' }
          : onDemo
            ? { label: t('tryDemoMode'), onClick: onDemo, variant: 'demo' }
            : undefined
      }
      secondaryAction={onConnect && onDemo ? { label: t('tryDemo'), onClick: onDemo } : undefined}
      size={size}
    />
  );
}

export function NoBankConnectionEmpty({
  onConnect,
  onDemo,
  size = 'md',
}: {
  onConnect?: () => void;
  onDemo?: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = useTranslations('emptyStates');
  return (
    <EmptyState
      icon={Building2}
      title={t('connectBankTitle')}
      description={t('connectBankDesc')}
      action={
        onConnect
          ? { label: t('connectBankAccount'), onClick: onConnect, variant: 'primary' }
          : onDemo
            ? { label: t('tryDemoMode'), onClick: onDemo, variant: 'demo' }
            : undefined
      }
      secondaryAction={onConnect && onDemo ? { label: t('tryDemo'), onClick: onDemo } : undefined}
      size={size}
    />
  );
}

/**
 * Inline empty state for widgets/cards
 */
export function InlineEmpty({
  message,
  action,
  className,
}: {
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-6 text-center', className)}>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && (
        <button onClick={action.onClick} className="mt-2 text-sm text-primary hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}
