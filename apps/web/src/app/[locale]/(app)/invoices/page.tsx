'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@moneio/ui/primitives';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import type { Invoice } from '@/components/invoices';
import { InvoiceList, InvoiceDetailDialog } from '@/components/invoices';
import { extractLocaleFromPath } from '@/lib/i18n';

type InvoiceStatus = 'pending' | 'approved' | 'paid' | 'void';

interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  pageSize: number;
}

export default function InvoicesPage() {
  const tNav = useTranslations('navigation');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  const locale = extractLocaleFromPath(pathname);

  // State
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');
  const pageSize = 20;

  // Dialog state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Animation
  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        workspaceId,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (status !== 'all') {
        params.append('status', status);
      }

      const response = await fetch(`/api/invoices?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }

      const data: InvoicesResponse = await response.json();
      setInvoices(data.invoices);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
      setError('Failed to load invoices. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, status]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [status]);

  // Handlers
  const handleInvoiceClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDialogOpen(true);
  };

  const handleApprove = async (id: string) => {
    if (!workspaceId) return;

    const response = await fetch(`/api/invoices/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });

    if (!response.ok) {
      throw new Error('Failed to approve invoice');
    }

    // Refresh the list
    await fetchInvoices();
  };

  const handleMarkPaid = async (id: string) => {
    if (!workspaceId) return;

    const response = await fetch(`/api/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, status: 'paid' }),
    });

    if (!response.ok) {
      throw new Error('Failed to mark invoice as paid');
    }

    // Refresh the list
    await fetchInvoices();
  };

  // No workspace selected
  if (!workspaceId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Select or create a workspace to view invoices</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={fetchInvoices}>
          Try again
        </Button>
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tNav('invoices')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} invoice{total !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Status Filter */}
        <Select value={status} onValueChange={(value) => setStatus(value as InvoiceStatus | 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice List */}
      <InvoiceList
        invoices={invoices}
        loading={loading}
        onInvoiceClick={handleInvoiceClick}
        locale={locale}
      />

      {/* Pagination */}
      {!loading && total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <InvoiceDetailDialog
        invoice={selectedInvoice}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onApprove={handleApprove}
        onMarkPaid={handleMarkPaid}
        locale={locale}
      />
    </div>
  );
}
