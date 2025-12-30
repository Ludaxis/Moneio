'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  FileText,
  Receipt,
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface PendingItem {
  id: string;
  type: 'invoice' | 'document' | 'transaction';
  title: string;
  subtitle: string;
  amount?: number;
  currency?: string;
  date: string;
  urgent?: boolean;
}

interface PendingCounts {
  invoices: number;
  documents: number;
  uncategorized: number;
  total: number;
}

interface PendingActionsWidgetProps {
  workspaceId: string;
}

const typeIcons = {
  invoice: FileText,
  document: Receipt,
  transaction: CreditCard,
};

const typeColors = {
  invoice: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400',
  document: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400',
  transaction: 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400',
};

export function PendingActionsWidget({ workspaceId }: PendingActionsWidgetProps) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [counts, setCounts] = useState<PendingCounts>({
    invoices: 0,
    documents: 0,
    uncategorized: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchPendingItems = useCallback(async () => {
    try {
      // Fetch pending items from multiple endpoints
      const [invoicesRes, documentsRes, transactionsRes] = await Promise.all([
        fetch(`/api/invoices?workspaceId=${workspaceId}&status=pending&pageSize=3`),
        fetch(`/api/documents?workspaceId=${workspaceId}&status=ready&pageSize=3`),
        fetch(`/api/transactions?workspaceId=${workspaceId}&uncategorized=true&pageSize=3`),
      ]);

      const pendingItems: PendingItem[] = [];
      let invoiceCount = 0;
      let documentCount = 0;
      let uncategorizedCount = 0;

      if (invoicesRes.ok) {
        const data = await invoicesRes.json();
        invoiceCount = data.total || data.invoices?.length || 0;
        (data.invoices || [])
          .slice(0, 2)
          .forEach(
            (inv: {
              id: string;
              vendorName?: string;
              invoiceNumber?: string;
              totalAmount?: number;
              currency?: string;
              dueDate?: string;
            }) => {
              const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
              const isOverdue = dueDate ? dueDate < new Date() : false;
              pendingItems.push({
                id: inv.id,
                type: 'invoice',
                title: inv.vendorName || 'Unknown Vendor',
                subtitle: `Invoice #${inv.invoiceNumber || 'N/A'}`,
                amount: inv.totalAmount,
                currency: inv.currency || 'USD',
                date: inv.dueDate || '',
                urgent: isOverdue,
              });
            }
          );
      }

      if (documentsRes.ok) {
        const data = await documentsRes.json();
        documentCount = data.total || data.documents?.length || 0;
        (data.documents || [])
          .slice(0, 2)
          .forEach(
            (doc: { id: string; fileName?: string; documentType?: string; createdAt?: string }) => {
              pendingItems.push({
                id: doc.id,
                type: 'document',
                title: doc.fileName || 'Untitled Document',
                subtitle: doc.documentType || 'Pending Review',
                date: doc.createdAt || '',
              });
            }
          );
      }

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        uncategorizedCount = data.total || data.transactions?.length || 0;
        (data.transactions || [])
          .slice(0, 2)
          .forEach(
            (tx: {
              id: string;
              description?: string;
              merchantName?: string;
              amount?: number;
              currency?: string;
              postedAt?: string;
            }) => {
              pendingItems.push({
                id: tx.id,
                type: 'transaction',
                title: tx.description || tx.merchantName || 'Unknown',
                subtitle: 'Needs categorization',
                amount: tx.amount ? Math.abs(tx.amount) : undefined,
                currency: tx.currency || 'USD',
                date: tx.postedAt || '',
              });
            }
          );
      }

      // Sort by urgency and date
      pendingItems.sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setItems(pendingItems.slice(0, 5));
      setCounts({
        invoices: invoiceCount,
        documents: documentCount,
        uncategorized: uncategorizedCount,
        total: invoiceCount + documentCount + uncategorizedCount,
      });
    } catch (error) {
      console.error('Failed to fetch pending items:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchPendingItems();
    }
  }, [workspaceId, fetchPendingItems]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">Pending Actions</h3>
          {counts.total > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-100 px-2 text-xs font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-300">
              {counts.total}
            </span>
          )}
        </div>
        <Clock className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Quick Stats */}
      {counts.total > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {counts.invoices > 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-2 text-center min-w-0">
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {counts.invoices}
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">Invoices</p>
            </div>
          )}
          {counts.documents > 0 && (
            <div className="rounded-lg bg-purple-50 dark:bg-purple-950 p-2 text-center min-w-0">
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {counts.documents}
              </p>
              <p className="text-xs text-purple-600/70 dark:text-purple-400/70 truncate">
                Documents
              </p>
            </div>
          )}
          {counts.uncategorized > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-2 text-center min-w-0">
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {counts.uncategorized}
              </p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70 truncate">Uncat.</p>
            </div>
          )}
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-success-500" />
          <p className="mt-2 font-medium text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground">No pending actions at this time.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => {
            const Icon = typeIcons[item.type];
            return (
              <Link
                key={item.id}
                href={
                  item.type === 'invoice'
                    ? `/invoices?id=${item.id}`
                    : item.type === 'document'
                      ? `/documents/${item.id}`
                      : `/transactions?highlight=${item.id}`
                }
                className="flex items-center gap-3 rounded-lg border border-transparent p-3 transition-all hover:bg-muted/50 hover:border-border group"
              >
                <div className={`rounded-lg p-2 ${typeColors[item.type]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                    {item.urgent && (
                      <AlertCircle className="h-4 w-4 text-danger-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {item.amount !== undefined && (
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(item.amount, item.currency || 'USD')}
                    </p>
                  )}
                  {item.date && (
                    <p
                      className={`text-xs ${item.urgent ? 'text-danger-500' : 'text-muted-foreground'}`}
                    >
                      {formatDate(item.date)}
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            );
          })}
        </div>
      )}

      {/* View All Link */}
      {counts.total > items.length && (
        <div className="mt-4 pt-4 border-t border-border">
          <Link
            href="/transactions?filter=pending"
            className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            View all {counts.total} pending items
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
