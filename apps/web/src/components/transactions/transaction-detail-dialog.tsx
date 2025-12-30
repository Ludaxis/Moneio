'use client';

import { cn } from '@moneio/ui';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@moneio/ui/primitives';
import {
  CheckCircle2,
  X,
  ArrowRight,
  Calendar,
  CreditCard,
  Tag,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { ConfidenceBadge, ExplanationPopover } from '@/components/ai';
import { CategorySelector } from '@/components/categories';

interface Transaction {
  id: string;
  postedAt: string;
  description: string | null;
  amount: number;
  currency: string;
  balance: number | null;
  categoryId: string | null;
  categoryName: string | null;
  pendingSuggestions?: Array<{
    id: string;
    type: 'categorization' | 'match';
    confidence: number;
    suggestedCategory?: { id: string; name: string };
    matchedInvoice?: { id: string; invoiceNumber: string | null; total: number };
    rationale?: string;
  }>;
}

interface TransactionDetailDialogProps {
  transaction: Transaction | null;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryApproved: () => void;
  locale?: string;
}

function formatCurrency(value: number, currency: string, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string, locale: string = 'en-US'): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Transaction Detail Dialog
 *
 * Shows transaction details and allows approving/rejecting AI suggestions
 * for categorization and invoice matching.
 */
export function TransactionDetailDialog({
  transaction,
  workspaceId,
  open,
  onOpenChange,
  onCategoryApproved,
  locale = 'en-US',
}: TransactionDetailDialogProps) {
  const [loading, setLoading] = useState<'approve' | 'reject' | 'match' | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Get suggestions
  const categorySuggestion = transaction?.pendingSuggestions?.find(
    (s) => s.type === 'categorization'
  );
  const matchSuggestion = transaction?.pendingSuggestions?.find((s) => s.type === 'match');

  // Initialize selected category from suggestion or existing
  useEffect(() => {
    if (transaction) {
      setSelectedCategoryId(
        transaction.categoryId || categorySuggestion?.suggestedCategory?.id || null
      );
    }
  }, [transaction, categorySuggestion]);

  const handleApproveCategory = useCallback(async () => {
    if (!transaction || !selectedCategoryId) return;

    setLoading('approve');
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          categoryId: selectedCategoryId,
          suggestionId: categorySuggestion?.id,
        }),
      });

      if (response.ok) {
        onCategoryApproved();
        onOpenChange(false);
      }
    } finally {
      setLoading(null);
    }
  }, [
    transaction,
    selectedCategoryId,
    workspaceId,
    categorySuggestion,
    onCategoryApproved,
    onOpenChange,
  ]);

  const handleRejectCategory = useCallback(async () => {
    if (!transaction || !categorySuggestion) return;

    setLoading('reject');
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/categorize`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          suggestionId: categorySuggestion.id,
        }),
      });

      if (response.ok) {
        onCategoryApproved();
        onOpenChange(false);
      }
    } finally {
      setLoading(null);
    }
  }, [transaction, categorySuggestion, workspaceId, onCategoryApproved, onOpenChange]);

  const handleApproveMatch = useCallback(async () => {
    if (!matchSuggestion) return;

    setLoading('match');
    try {
      const response = await fetch(`/api/matches/${matchSuggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          status: 'approved',
        }),
      });

      if (response.ok) {
        onCategoryApproved();
        onOpenChange(false);
      }
    } finally {
      setLoading(null);
    }
  }, [matchSuggestion, workspaceId, onCategoryApproved, onOpenChange]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (categorySuggestion && selectedCategoryId) {
          handleApproveCategory();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, categorySuggestion, selectedCategoryId, handleApproveCategory]);

  if (!transaction) return null;

  const isExpense = transaction.amount < 0;
  const hasApprovedCategory = !!transaction.categoryId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            Transaction Details
          </DialogTitle>
          <DialogDescription>
            Review and approve AI suggestions for this transaction.
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Info */}
        <div className="space-y-4">
          {/* Main info */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-lg font-medium text-foreground">
              {transaction.description || 'Unknown transaction'}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span
                className={cn(
                  'text-2xl font-bold',
                  isExpense ? 'text-danger-600' : 'text-success-600'
                )}
              >
                {formatCurrency(transaction.amount, transaction.currency, locale)}
              </span>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {formatDate(transaction.postedAt, locale)}
              </div>
            </div>
            {transaction.balance !== null && (
              <p className="mt-2 text-sm text-muted-foreground">
                Balance after: {formatCurrency(transaction.balance, transaction.currency, locale)}
              </p>
            )}
          </div>

          {/* Current Category */}
          {hasApprovedCategory && (
            <div className="flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 p-3 dark:border-success-800 dark:bg-success-900/20">
              <CheckCircle2 className="h-5 w-5 text-success-600" />
              <span className="text-sm text-success-700 dark:text-success-400">
                Categorized as: <strong>{transaction.categoryName}</strong>
              </span>
            </div>
          )}

          {/* Category Suggestion */}
          {categorySuggestion && !hasApprovedCategory && (
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-medium text-foreground">AI Category Suggestion</span>
                </div>
                <div className="flex items-center gap-2">
                  <ConfidenceBadge confidence={categorySuggestion.confidence} showValue size="sm" />
                  {categorySuggestion.rationale && (
                    <ExplanationPopover
                      title="AI Reasoning"
                      explanation={categorySuggestion.rationale}
                      confidence={categorySuggestion.confidence}
                    />
                  )}
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm text-muted-foreground">Category</label>
                <CategorySelector
                  workspaceId={workspaceId}
                  value={selectedCategoryId || undefined}
                  suggestedId={categorySuggestion.suggestedCategory?.id}
                  suggestedName={categorySuggestion.suggestedCategory?.name}
                  suggestedConfidence={categorySuggestion.confidence}
                  onChange={setSelectedCategoryId}
                />
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="success"
                  className="flex-1"
                  onClick={handleApproveCategory}
                  disabled={loading !== null || !selectedCategoryId}
                >
                  {loading === 'approve' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRejectCategory}
                  disabled={loading !== null}
                >
                  {loading === 'reject' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-2 h-4 w-4" />
                  )}
                  Reject
                </Button>
              </div>
            </div>
          )}

          {/* Match Suggestion */}
          {matchSuggestion && (
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  <span className="font-medium text-foreground">Invoice Match</span>
                </div>
                <ConfidenceBadge confidence={matchSuggestion.confidence} showValue size="sm" />
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Matches invoice:</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {matchSuggestion.matchedInvoice?.invoiceNumber ||
                    `#${matchSuggestion.matchedInvoice?.id.slice(0, 8)}`}
                </span>
                {matchSuggestion.matchedInvoice && (
                  <span className="text-muted-foreground">
                    (
                    {formatCurrency(
                      matchSuggestion.matchedInvoice.total,
                      transaction.currency,
                      locale
                    )}
                    )
                  </span>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="success"
                  className="flex-1"
                  onClick={handleApproveMatch}
                  disabled={loading !== null}
                >
                  {loading === 'match' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Approve Match
                </Button>
              </div>
            </div>
          )}

          {/* No suggestions */}
          {!categorySuggestion && !matchSuggestion && !hasApprovedCategory && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <Tag className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No AI suggestions for this transaction.
              </p>
              <div className="mt-3">
                <label className="mb-2 block text-sm text-muted-foreground">
                  Assign category manually:
                </label>
                <CategorySelector
                  workspaceId={workspaceId}
                  value={selectedCategoryId || undefined}
                  onChange={setSelectedCategoryId}
                />
                {selectedCategoryId && (
                  <Button
                    variant="success"
                    className="mt-3 w-full"
                    onClick={handleApproveCategory}
                    disabled={loading !== null}
                  >
                    {loading === 'approve' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Save Category
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <p className="text-xs text-muted-foreground">
            Press <kbd className="rounded bg-muted px-1 py-0.5 text-xs">⌘</kbd> +{' '}
            <kbd className="rounded bg-muted px-1 py-0.5 text-xs">Enter</kbd> to approve
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
