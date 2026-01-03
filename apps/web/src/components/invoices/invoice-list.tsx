'use client';

import { useStaggerAnimation } from '@moneio/ui/hooks/use-gsap';
import { CheckCircle, FileText, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';

import { InvoiceStatusBadge } from './invoice-status-badge';

export interface Invoice {
  id: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  vatRate: number | null;
  status: 'pending' | 'approved' | 'paid' | 'void';
  merchant: { id: string; name: string } | null;
  document: { id: string; fileName: string } | null;
  lineItems: Array<{
    id: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    amount: number;
    vatRate: number | null;
  }>;
  hasMatch: boolean;
  createdAt: string;
}

interface InvoiceListProps {
  invoices: Invoice[];
  loading?: boolean;
  onInvoiceClick: (invoice: Invoice) => void;
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

function formatDate(dateStr: string | null, locale: string = 'en-US'): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'paid' || status === 'void') return false;
  return new Date(dueDate) < new Date();
}

function LoadingSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-4 border-b border-border">
        <div className="grid grid-cols-7 gap-4">
          {['Invoice #', 'Merchant', 'Issue Date', 'Due Date', 'Amount', 'Status', 'Match'].map(
            (header) => (
              <div key={header} className="h-4 w-20 animate-pulse rounded bg-muted" />
            )
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4">
            <div className="grid grid-cols-7 gap-4">
              {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                <div key={j} className="h-5 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InvoiceList({
  invoices,
  loading,
  onInvoiceClick,
  locale = 'en-US',
}: InvoiceListProps) {
  const t = useTranslations('invoices');
  const tEmpty = useTranslations('emptyStates');
  const listRef = useStaggerAnimation(invoices.length, {
    stagger: 0.05,
    duration: 0.3,
  }) as React.RefObject<HTMLDivElement>;

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">{tEmpty('noInvoices')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tEmpty('uploadDocuments')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-4 py-3 border-b border-border">
        <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
          <div>{t('invoiceNumber')}</div>
          <div>{t('merchant')}</div>
          <div>{t('issueDate')}</div>
          <div>{t('dueDate')}</div>
          <div className="text-end">{t('amount')}</div>
          <div>{t('status')}</div>
          <div className="text-center">{t('match')}</div>
        </div>
      </div>

      {/* Rows */}
      <div ref={listRef} className="divide-y divide-border">
        {invoices.map((invoice) => {
          const overdue = isOverdue(invoice.dueDate, invoice.status);

          return (
            <div
              key={invoice.id}
              onClick={() => onInvoiceClick(invoice)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onInvoiceClick(invoice);
                }
              }}
              role="button"
              tabIndex={0}
              className="px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors focus:outline-none focus:bg-muted/50"
            >
              <div className="grid grid-cols-7 gap-4 items-center">
                {/* Invoice Number */}
                <div className="text-sm font-medium text-foreground truncate">
                  {invoice.invoiceNumber || t('noNumber')}
                </div>

                {/* Merchant */}
                <div className="text-sm text-foreground truncate">
                  {invoice.merchant?.name || '-'}
                </div>

                {/* Issue Date */}
                <div className="text-sm text-muted-foreground">
                  {formatDate(invoice.issueDate, locale)}
                </div>

                {/* Due Date */}
                <div
                  className={`text-sm ${
                    overdue ? 'text-chart-expense font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {formatDate(invoice.dueDate, locale)}
                  {overdue && <span className="ms-1 text-xs">({t('overdue')})</span>}
                </div>

                {/* Amount */}
                <div className="text-sm font-semibold tabular-nums text-foreground text-end">
                  {formatCurrency(invoice.total, invoice.currency, locale)}
                </div>

                {/* Status */}
                <div>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>

                {/* Match indicator */}
                <div className="flex justify-center">
                  {invoice.hasMatch ? (
                    <div className="flex items-center gap-1 text-chart-income">
                      <Link2 className="h-4 w-4" />
                      <CheckCircle className="h-3 w-3" />
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
