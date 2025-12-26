'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Receipt, Filter, Eye } from 'lucide-react';
import { Button, EmptyState, FilterBar, Badge, DataTable } from '@moneio/ui';
import Link from 'next/link';

interface Invoice {
  id: string;
  documentId: string;
  invoiceNumber: string;
  vendor: string;
  issueDate: string;
  dueDate?: string;
  total: number;
  currency: string;
  vatTotal: number;
  status: 'draft' | 'approved' | 'paid' | 'void';
}

export function InvoicesContent() {
  const t = useTranslations('invoices');
  const tCommon = useTranslations('common');
  const [searchQuery, setSearchQuery] = useState('');
  const [invoices] = useState<Invoice[]>([]); // Will be fetched from API

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  const statusColors = {
    draft: 'secondary',
    approved: 'success',
    paid: 'default',
    void: 'danger',
  } as const;

  const columns = [
    {
      key: 'invoiceNumber',
      header: t('number'),
      cell: (row: Invoice) => (
        <span className="font-medium">{row.invoiceNumber || 'N/A'}</span>
      ),
    },
    {
      key: 'vendor',
      header: t('vendor'),
      cell: (row: Invoice) => row.vendor,
    },
    {
      key: 'issueDate',
      header: t('issueDate'),
      cell: (row: Invoice) => new Date(row.issueDate).toLocaleDateString(),
    },
    {
      key: 'total',
      header: t('total'),
      cell: (row: Invoice) => (
        <span className="tabular-nums font-medium">
          {formatAmount(row.total, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'vat',
      header: t('vat'),
      cell: (row: Invoice) => (
        <span className="tabular-nums text-neutral-600">
          {formatAmount(row.vatTotal, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'status',
      header: t('status'),
      cell: (row: Invoice) => (
        <Badge variant={statusColors[row.status]}>{t(row.status)}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row: Invoice) => (
        <Link href={`/invoices/${row.id}`}>
          <Button variant="ghost" size="sm">
            <Eye className="h-4 w-4" />
          </Button>
        </Link>
      ),
      className: 'w-10',
    },
  ];

  return (
    <div className="space-y-6">
      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={`${tCommon('search')} ${t('title').toLowerCase()}...`}
        filters={
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            {tCommon('filter')}
          </Button>
        }
      />

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-12 dark:border-neutral-700 dark:bg-neutral-800">
          <EmptyState
            icon={<Receipt className="h-12 w-12" />}
            title="No invoices yet"
            description="Invoices extracted from your documents will appear here"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          <DataTable
            data={invoices}
            columns={columns}
            keyExtractor={(row) => row.id}
          />
        </div>
      )}
    </div>
  );
}
