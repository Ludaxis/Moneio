'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard, Upload, Filter, Check, X } from 'lucide-react';
import { Button, EmptyState, FilterBar, Badge, DataTable } from '@moneio/ui';
import { CSVImportWizard } from './csv-import-wizard';

interface Transaction {
  id: string;
  postedAt: string;
  description: string;
  amount: number;
  currency: string;
  category?: string;
  categoryConfidence?: number;
  isReconciled: boolean;
}

export function TransactionsContent() {
  const t = useTranslations('transactions');
  const tCategories = useTranslations('categories');
  const tCommon = useTranslations('common');
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions] = useState<Transaction[]>([]); // Will be fetched from API

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  const columns = [
    {
      key: 'postedAt',
      header: t('date'),
      cell: (row: Transaction) => new Date(row.postedAt).toLocaleDateString(),
      className: 'w-32',
    },
    {
      key: 'description',
      header: t('description'),
      cell: (row: Transaction) => (
        <span className="line-clamp-1">{row.description}</span>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      cell: (row: Transaction) => (
        <div className="flex items-center gap-2">
          {row.category ? (
            <>
              <Badge variant="secondary">{row.category}</Badge>
              {row.categoryConfidence && row.categoryConfidence < 80 && (
                <span className="text-xs text-neutral-500">
                  {row.categoryConfidence}%
                </span>
              )}
            </>
          ) : (
            <span className="text-neutral-400">{t('uncategorized')}</span>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('amount'),
      cell: (row: Transaction) => (
        <span
          className={`tabular-nums font-medium ${
            row.amount >= 0 ? 'text-success-600' : 'text-danger-600'
          }`}
        >
          {formatAmount(row.amount, row.currency)}
        </span>
      ),
      className: 'text-right w-32',
      headerClassName: 'text-right',
    },
    {
      key: 'reconciled',
      header: '',
      cell: (row: Transaction) =>
        row.isReconciled ? (
          <Check className="h-4 w-4 text-success-600" />
        ) : null,
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
          <>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              {tCommon('filter')}
            </Button>
            <Button variant="outline" size="sm">
              {tCategories('suggested')}
            </Button>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm">
              {tCategories('bulkAccept')}
            </Button>
            <Button onClick={() => setShowImport(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t('importCsv')}
            </Button>
          </>
        }
      />

      {transactions.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-12 dark:border-neutral-700 dark:bg-neutral-800">
          <EmptyState
            icon={<CreditCard className="h-12 w-12" />}
            title={t('noTransactions')}
            description="Import your bank statement CSV to get started"
            action={
              <Button onClick={() => setShowImport(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {t('importCsv')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          <DataTable
            data={transactions}
            columns={columns}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => console.log('View transaction:', row.id)}
          />
        </div>
      )}

      {showImport && <CSVImportWizard onClose={() => setShowImport(false)} />}
    </div>
  );
}
