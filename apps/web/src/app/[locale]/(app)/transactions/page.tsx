'use client';

import { cn } from '@moneio/ui';
import {
  ArrowUpDown,
  Plus,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

interface BankTransaction {
  id: string;
  postedAt: string;
  description: string | null;
  amount: number;
  currency: string;
  balance: number | null;
  hasMatch: boolean;
  categoryName: string | null;
}

interface TransactionsResponse {
  transactions: BankTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

export default function TransactionsPage() {
  const t = useTranslations('transactions');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/transactions?workspaceId=${workspaceId}&page=${page}&pageSize=${pageSize}`
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
    };

    fetchTransactions();
  }, [workspaceId, page]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!workspaceId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Select or create a workspace to view transactions</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {t('title').toLowerCase()}
          </p>
        </div>
        <Link
          href={`/${locale}/transactions/import?workspace=${workspaceId}`}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" />
          {tCommon('import')}
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <ArrowUpDown className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No transactions yet</p>
            <Link
              href={`/${locale}/transactions/import?workspace=${workspaceId}`}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Plus className="h-4 w-4" />
              Import your first bank statement
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      {t('date')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      {t('description')}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                      {t('amount')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      {t('category')}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                      Match
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-accent/50">
                      <td className="px-4 py-3 text-sm">{formatDate(tx.postedAt)}</td>
                      <td className="px-4 py-3 text-sm max-w-[300px] truncate">
                        {tx.description || '-'}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-sm text-right font-tabular-nums',
                          tx.amount >= 0 ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {tx.categoryName ? (
                          <span className="rounded-full bg-muted px-2 py-1 text-xs">
                            {tx.categoryName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {tx.hasMatch ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                        ) : (
                          <LinkIcon className="mx-auto h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > pageSize && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of{' '}
                  {total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page * pageSize >= total}
                    className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
