'use client';

/**
 * Transactions Client Component
 *
 * Handles interactive state (selection, pagination, dialogs) for transactions page.
 * Receives initial data from the server component.
 */

import { cn } from '@moneio/ui';
import {
  ArrowUpDown,
  Plus,
  Upload,
  Loader2,
  CheckCircle2,
  Link as LinkIcon,
  Trash2,
  Copy,
  X,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import { ConfidenceBadge } from '@/components/ai';
import { TransactionDetailDialog } from '@/components/transactions';
import { useTranslateCategory } from '@/hooks/use-translate-category';

interface PendingSuggestion {
  id: string;
  type: 'categorization' | 'match';
  confidence: number;
  suggestedCategory?: { id: string; name: string };
  matchedInvoice?: { id: string; invoiceNumber: string | null; total: number };
  rationale?: string;
}

interface BankTransaction {
  id: string;
  postedAt: string;
  description: string | null;
  amount: number | string;
  currency: string;
  balance: number | string | null;
  hasMatch: boolean;
  categoryId: string | null;
  categoryName: string | null;
  pendingSuggestions?: PendingSuggestion[];
}

interface TransactionsClientProps {
  workspaceId: string;
  locale: string;
  initialTransactions: BankTransaction[];
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
}

interface TransactionsResponse {
  transactions: BankTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

export function TransactionsClient({
  workspaceId,
  locale,
  initialTransactions,
  initialTotal,
  initialPage,
  initialPageSize,
}: TransactionsClientProps) {
  const t = useTranslations('transactions');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const translateCategory = useTranslateCategory();

  const [transactions, setTransactions] = useState<BankTransaction[]>(initialTransactions);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [loadingAllIds, setLoadingAllIds] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Duplicates state
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [removingDuplicates, setRemovingDuplicates] = useState(false);
  const [showDuplicatesBanner, setShowDuplicatesBanner] = useState(false);

  // Transaction detail dialog state
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approvingInline, setApprovingInline] = useState<string | null>(null);

  // Fetch transactions (for pagination and refresh)
  const fetchTransactions = useCallback(
    async (newPage: number, newPageSize: number) => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/transactions?workspaceId=${workspaceId}&page=${newPage}&pageSize=${newPageSize}&includeSuggestions=true`
        );
        if (response.ok) {
          const data: TransactionsResponse = await response.json();
          setTransactions(data.transactions);
          setTotal(data.total);
        }
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId]
  );

  // Handle page change
  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      // Update URL
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(newPage));
      router.push(`?${params.toString()}`, { scroll: false });
      fetchTransactions(newPage, pageSize);
    },
    [searchParams, router, fetchTransactions, pageSize]
  );

  // Handle page size change
  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      setPageSize(newPageSize);
      setPage(1);
      // Update URL
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', String(newPageSize));
      params.set('page', '1');
      router.push(`?${params.toString()}`, { scroll: false });
      fetchTransactions(1, newPageSize);
    },
    [searchParams, router, fetchTransactions]
  );

  // Check for duplicates
  const checkDuplicates = useCallback(async () => {
    setCheckingDuplicates(true);
    try {
      const response = await fetch(`/api/transactions/duplicates?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setDuplicateCount(data.totalDuplicates);
        setDuplicateIds(data.removeIds);
        if (data.totalDuplicates > 0) {
          setShowDuplicatesBanner(true);
        }
      }
    } catch (error) {
      console.error('Failed to check duplicates:', error);
    } finally {
      setCheckingDuplicates(false);
    }
  }, [workspaceId]);

  // Fetch all transaction IDs for "select all pages"
  const fetchAllTransactionIds = useCallback(async () => {
    setLoadingAllIds(true);
    try {
      const response = await fetch(
        `/api/transactions?workspaceId=${workspaceId}&page=1&pageSize=${total}`
      );
      if (response.ok) {
        const data: TransactionsResponse = await response.json();
        return data.transactions.map((t) => t.id);
      }
    } catch (error) {
      console.error('Failed to fetch all transaction IDs:', error);
    } finally {
      setLoadingAllIds(false);
    }
    return [];
  }, [workspaceId, total]);

  // Refetch transactions
  const refetchTransactions = useCallback(() => {
    fetchTransactions(page, pageSize);
  }, [fetchTransactions, page, pageSize]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectAllPages(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectCurrentPage = () => {
    setSelectAllPages(false);
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const handleSelectAllPages = async () => {
    if (selectAllPages) {
      setSelectAllPages(false);
      setSelectedIds(new Set());
    } else {
      const ids = await fetchAllTransactionIds();
      setSelectAllPages(true);
      setSelectedIds(new Set(ids));
    }
  };

  const handleClearSelection = () => {
    setSelectAllPages(false);
    setSelectedIds(new Set());
  };

  // Delete selected transactions
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(t('confirmDelete', { count: selectedIds.size }))) {
      return;
    }

    setDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      const batches = [];
      for (let i = 0; i < idsArray.length; i += 500) {
        batches.push(idsArray.slice(i, i + 500));
      }

      for (const batch of batches) {
        await fetch('/api/transactions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            transactionIds: batch,
          }),
        });
      }

      setSelectedIds(new Set());
      setSelectAllPages(false);
      await refetchTransactions();
      checkDuplicates();
    } catch (error) {
      console.error('Failed to delete transactions:', error);
    } finally {
      setDeleting(false);
    }
  };

  // Remove all duplicates
  const handleRemoveDuplicates = async () => {
    if (duplicateCount === 0) return;

    if (!confirm(t('confirmRemoveDuplicates', { count: duplicateCount }))) {
      return;
    }

    setRemovingDuplicates(true);
    try {
      const response = await fetch(`/api/transactions/duplicates?workspaceId=${workspaceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDuplicateCount(0);
        setDuplicateIds([]);
        setShowDuplicatesBanner(false);
        setSelectedIds(new Set());
        setSelectAllPages(false);
        await refetchTransactions();
      }
    } catch (error) {
      console.error('Failed to remove duplicates:', error);
    } finally {
      setRemovingDuplicates(false);
    }
  };

  // Handle row click to open detail dialog
  const handleRowClick = (tx: BankTransaction, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    setSelectedTransaction(tx);
    setDialogOpen(true);
  };

  // Handle inline quick approve for category suggestion
  const handleInlineApprove = async (tx: BankTransaction, e: React.MouseEvent) => {
    e.stopPropagation();
    const suggestion = tx.pendingSuggestions?.find((s) => s.type === 'categorization');
    if (!suggestion?.suggestedCategory) return;

    setApprovingInline(tx.id);
    try {
      const response = await fetch(`/api/transactions/${tx.id}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          categoryId: suggestion.suggestedCategory.id,
          suggestionId: suggestion.id,
        }),
      });

      if (response.ok) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === tx.id
              ? {
                  ...t,
                  categoryId: suggestion.suggestedCategory!.id,
                  categoryName: suggestion.suggestedCategory!.name,
                  pendingSuggestions: t.pendingSuggestions?.filter((s) => s.id !== suggestion.id),
                }
              : t
          )
        );
      }
    } catch (error) {
      console.error('Failed to approve category:', error);
    } finally {
      setApprovingInline(null);
    }
  };

  const handleCategoryApproved = () => {
    refetchTransactions();
  };

  const formatCurrency = (amount: number | string, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(numAmount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Duplicates Banner */}
      {showDuplicatesBanner && duplicateCount !== null && duplicateCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex items-center gap-3">
            <Copy className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                {t('duplicatesFound', { count: duplicateCount })}
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {t('duplicatesDescription')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRemoveDuplicates}
              disabled={removingDuplicates}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {removingDuplicates ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('removing')}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {t('removeDuplicates')}
                </>
              )}
            </button>
            <button
              onClick={() => setShowDuplicatesBanner(false)}
              className="rounded p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {t('title').toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={checkDuplicates}
            disabled={checkingDuplicates}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            {checkingDuplicates ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {t('findDuplicates')}
          </button>
          <Link
            href={`/${locale}/transactions/import?workspace=${workspaceId}`}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="h-4 w-4" />
            {tCommon('import')}
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="relative rounded-lg border border-border bg-card overflow-hidden">
        {/* Loading overlay */}
        {(deleting || removingDuplicates) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">
                {deleting
                  ? t('deleting')
                  : t('removingDuplicates')}
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <ArrowUpDown className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">{t('noTransactions')}</p>
            <Link
              href={`/${locale}/transactions/import?workspace=${workspaceId}`}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Plus className="h-4 w-4" />
              {t('importFirst')}
            </Link>
          </div>
        ) : (
          <>
            {/* Bulk Actions Bar */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size > 0 ? (
                    <span className="font-medium text-foreground">
                      {selectAllPages ? (
                        <>{t('allSelected', { count: total })}</>
                      ) : (
                        <>{t('selected', { count: selectedIds.size })}</>
                      )}
                    </span>
                  ) : (
                    <span>{t('selectToDelete')}</span>
                  )}
                </span>
                {selectedIds.size > 0 &&
                  selectedIds.size === transactions.length &&
                  !selectAllPages &&
                  total > transactions.length && (
                    <button
                      onClick={handleSelectAllPages}
                      disabled={loadingAllIds}
                      className="text-sm text-primary hover:underline disabled:opacity-50"
                    >
                      {loadingAllIds ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {tCommon('loading')}
                        </span>
                      ) : (
                        <>{t('selectAll', { count: total })}</>
                      )}
                    </button>
                  )}
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleClearSelection}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {t('clearSelection')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                    className="flex items-center gap-1.5 rounded border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20 disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t('deleteSelected', { count: selectedIds.size })}
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          (selectedIds.size === transactions.length && transactions.length > 0) ||
                          selectAllPages
                        }
                        onChange={handleSelectCurrentPage}
                        className="h-4 w-4 rounded border-border"
                        title={t('selectAllOnPage')}
                      />
                    </th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                      {t('date')}
                    </th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                      {t('description')}
                    </th>
                    <th className="px-4 py-3 text-end text-sm font-medium text-muted-foreground">
                      {t('amount')}
                    </th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                      {t('category')}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                      {t('match')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => {
                    const categorySuggestion = tx.pendingSuggestions?.find(
                      (s) => s.type === 'categorization'
                    );
                    const matchSuggestion = tx.pendingSuggestions?.find((s) => s.type === 'match');
                    const hasPendingSuggestion = !!categorySuggestion || !!matchSuggestion;

                    return (
                      <tr
                        key={tx.id}
                        onClick={(e) => handleRowClick(tx, e)}
                        className={cn(
                          'hover:bg-accent/50 cursor-pointer',
                          selectedIds.has(tx.id) && 'bg-primary/5',
                          duplicateIds.includes(tx.id) && 'bg-amber-50/50 dark:bg-amber-950/20',
                          hasPendingSuggestion && 'bg-primary/5'
                        )}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={() => handleToggleSelect(tx.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">{formatDate(tx.postedAt)}</td>
                        <td className="px-4 py-3 text-sm max-w-[300px] truncate">
                          {tx.description || '-'}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-sm text-end font-tabular-nums',
                            Number(tx.amount) >= 0 ? 'text-success' : 'text-destructive'
                          )}
                        >
                          {formatCurrency(tx.amount, tx.currency)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {tx.categoryName ? (
                            <span className="rounded-full bg-muted px-2 py-1 text-xs">
                              {translateCategory(tx.categoryName)}
                            </span>
                          ) : categorySuggestion?.suggestedCategory ? (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {translateCategory(categorySuggestion.suggestedCategory.name)}
                                </span>
                              </div>
                              <ConfidenceBadge
                                confidence={categorySuggestion.confidence}
                                size="sm"
                              />
                              <button
                                onClick={(e) => handleInlineApprove(tx, e)}
                                disabled={approvingInline === tx.id}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-success-100 text-success-700 hover:bg-success-200 disabled:opacity-50 dark:bg-success-900/30 dark:text-success-400"
                                title={t('approveCategory')}
                              >
                                {approvingInline === tx.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {tx.hasMatch ? (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                          ) : matchSuggestion ? (
                            <div className="flex items-center justify-center gap-1">
                              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                              <ConfidenceBadge confidence={matchSuggestion.confidence} size="sm" />
                            </div>
                          ) : (
                            <LinkIcon className="mx-auto h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  {t('showing', {
                    from: transactions.length > 0 ? (page - 1) * pageSize + 1 : 0,
                    to: Math.min(page * pageSize, total),
                    total: total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <label htmlFor="pageSize" className="text-sm text-muted-foreground">
                    {t('rows')}:
                  </label>
                  <select
                    id="pageSize"
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>
              {total > pageSize && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {t('previous')}
                  </button>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page * pageSize >= total}
                    className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {t('next')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Transaction Detail Dialog */}
      <TransactionDetailDialog
        transaction={selectedTransaction}
        workspaceId={workspaceId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCategoryApproved={handleCategoryApproved}
        locale={locale as 'en' | 'et' | 'fa' | 'ar'}
      />
    </div>
  );
}
