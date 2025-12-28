'use client';

import { ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  categoryName?: string;
}

interface RecentActivityProps {
  transactions: Transaction[];
  loading?: boolean;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentActivity({ transactions, loading }: RecentActivityProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
      <div className="mt-4 space-y-1">
        {transactions.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <div className="text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No recent transactions</p>
            </div>
          </div>
        ) : (
          transactions.slice(0, 5).map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-lg p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    tx.amount < 0
                      ? 'bg-red-100 dark:bg-red-900/20'
                      : 'bg-green-100 dark:bg-green-900/20'
                  }`}
                >
                  {tx.amount < 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-red-500" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-green-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {tx.description || 'No description'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.categoryName || 'Uncategorized'} &bull; {formatDate(tx.date)}
                  </p>
                </div>
              </div>
              <p
                className={`text-sm font-semibold tabular-nums ${
                  tx.amount < 0 ? 'text-red-500' : 'text-green-500'
                }`}
              >
                {tx.amount < 0 ? '-' : '+'}
                {formatCurrency(tx.amount, tx.currency)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
