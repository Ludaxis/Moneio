'use client';

import { cn } from '@moneio/ui';
import { Button } from '@moneio/ui/primitives';
import { CheckCircle2, X, ArrowRight, FileText, Tag, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { ConfidenceBadge } from '@/components/ai';

interface SuggestionCardProps {
  id: string;
  type: 'categorization' | 'match';
  confidence: number;
  transaction: {
    id: string;
    description: string | null;
    amount: number;
    currency: string;
    postedAt: string;
  };
  suggestedCategory?: {
    id: string;
    name: string;
  };
  matchedInvoice?: {
    id: string;
    invoiceNumber: string | null;
    total: number;
  };
  rationale?: string;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  showCheckbox?: boolean;
  compact?: boolean;
}

/**
 * Suggestion Card
 *
 * Displays a single AI suggestion with quick approve/reject actions.
 */
export function SuggestionCard({
  id,
  type,
  confidence,
  transaction,
  suggestedCategory,
  matchedInvoice,
  rationale: _rationale,
  selected,
  onSelect,
  onApprove,
  onReject,
  showCheckbox = false,
  compact = false,
}: SuggestionCardProps) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  const handleApprove = async () => {
    setLoading('approve');
    try {
      await onApprove(id);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading('reject');
    try {
      await onReject(id);
    } finally {
      setLoading(null);
    }
  };

  // Format amount
  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isExpense = transaction.amount < 0;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50',
        compact && 'p-2'
      )}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect?.(id, e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
      )}

      {/* Icon */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          type === 'categorization' ? 'bg-primary/10' : 'bg-purple-100 dark:bg-purple-900/30'
        )}
      >
        {type === 'categorization' ? (
          <Tag className="h-4 w-4 text-primary" />
        ) : (
          <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Transaction description */}
        <p className="truncate text-sm font-medium text-foreground">
          {transaction.description || 'Unknown transaction'}
        </p>

        {/* Suggestion info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn(isExpense ? 'text-danger-600' : 'text-success-600')}>
            {formatAmount(transaction.amount, transaction.currency)}
          </span>
          <span>•</span>
          <span>{formatDate(transaction.postedAt)}</span>
          {type === 'categorization' && suggestedCategory && (
            <>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium text-foreground">{suggestedCategory.name}</span>
            </>
          )}
          {type === 'match' && matchedInvoice && (
            <>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium text-foreground">
                {matchedInvoice.invoiceNumber || `Invoice ${matchedInvoice.id.slice(0, 8)}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Confidence */}
      <ConfidenceBadge confidence={confidence} showValue size="sm" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-success-600 hover:bg-success-100 hover:text-success-700 dark:hover:bg-success-900/30"
          onClick={handleApprove}
          disabled={loading !== null}
        >
          {loading === 'approve' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-danger-600 hover:bg-danger-100 hover:text-danger-700 dark:hover:bg-danger-900/30"
          onClick={handleReject}
          disabled={loading !== null}
        >
          {loading === 'reject' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
