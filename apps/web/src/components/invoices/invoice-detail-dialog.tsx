'use client';


import { Button ,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@moneio/ui/primitives';
import { CheckCircle, ExternalLink, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { Invoice } from './invoice-list';
import { InvoiceStatusBadge } from './invoice-status-badge';

interface InvoiceDetailDialogProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (id: string) => Promise<void>;
  onMarkPaid: (id: string) => Promise<void>;
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
    month: 'long',
    day: 'numeric',
  });
}

export function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
  onApprove,
  onMarkPaid,
  locale = 'en-US',
}: InvoiceDetailDialogProps) {
  const [loading, setLoading] = useState<'approve' | 'paid' | null>(null);

  if (!invoice) return null;

  const handleApprove = async () => {
    setLoading('approve');
    try {
      await onApprove(invoice.id);
      onOpenChange(false);
    } finally {
      setLoading(null);
    }
  };

  const handleMarkPaid = async () => {
    setLoading('paid');
    try {
      await onMarkPaid(invoice.id);
      onOpenChange(false);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl">
              Invoice {invoice.invoiceNumber || 'No Number'}
            </DialogTitle>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <DialogDescription>
            Created on {formatDate(invoice.createdAt, locale)}
          </DialogDescription>
        </DialogHeader>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 py-4 border-y border-border">
          <div>
            <p className="text-sm text-muted-foreground">Merchant</p>
            <p className="text-sm font-medium text-foreground">
              {invoice.merchant?.name || 'Unknown'}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Currency</p>
            <p className="text-sm font-medium text-foreground">{invoice.currency}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Issue Date</p>
            <p className="text-sm font-medium text-foreground">
              {formatDate(invoice.issueDate, locale)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Due Date</p>
            <p className="text-sm font-medium text-foreground">
              {formatDate(invoice.dueDate, locale)}
            </p>
          </div>
          {invoice.document && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Source Document</p>
              <Link
                href={`/documents/${invoice.document.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <FileText className="h-4 w-4" />
                {invoice.document.fileName}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>

        {/* Line Items */}
        {invoice.lineItems.length > 0 && (
          <div className="py-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Line Items</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Description
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                      Unit Price
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoice.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-foreground">
                        {item.description || 'No description'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {item.quantity}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(item.unitPrice, invoice.currency, locale)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                        {formatCurrency(item.amount, invoice.currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="py-4 border-t border-border">
          <div className="flex flex-col items-end gap-1">
            <div className="flex justify-between w-48 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums text-foreground">
                {formatCurrency(invoice.subtotal, invoice.currency, locale)}
              </span>
            </div>
            {invoice.vatAmount > 0 && (
              <div className="flex justify-between w-48 text-sm">
                <span className="text-muted-foreground">
                  VAT {invoice.vatRate ? `(${invoice.vatRate}%)` : ''}
                </span>
                <span className="tabular-nums text-foreground">
                  {formatCurrency(invoice.vatAmount, invoice.currency, locale)}
                </span>
              </div>
            )}
            <div className="flex justify-between w-48 text-base font-semibold border-t border-border pt-2 mt-1">
              <span className="text-foreground">Total</span>
              <span className="tabular-nums text-foreground">
                {formatCurrency(invoice.total, invoice.currency, locale)}
              </span>
            </div>
          </div>
        </div>

        {/* Match Status */}
        {invoice.hasMatch && (
          <div className="py-4 border-t border-border">
            <div className="flex items-center gap-2 text-chart-income">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Matched with bank transaction</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <DialogFooter className="gap-2">
          {invoice.status === 'pending' && (
            <Button onClick={handleApprove} disabled={loading !== null} variant="success">
              {loading === 'approve' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Invoice
                </>
              )}
            </Button>
          )}
          {invoice.status === 'approved' && (
            <Button onClick={handleMarkPaid} disabled={loading !== null}>
              {loading === 'paid' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Mark as Paid'
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
