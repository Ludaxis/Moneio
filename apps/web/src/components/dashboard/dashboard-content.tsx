'use client';

import { useTranslations } from 'next-intl';
import {
  TrendingUp,
  TrendingDown,
  FileText,
  CreditCard,
  DollarSign,
  Clock,
} from 'lucide-react';
import { StatCard, EmptyState, Button } from '@moneio/ui';
import Link from 'next/link';

export function DashboardContent() {
  const t = useTranslations('dashboard');
  const tDoc = useTranslations('documents');

  // Placeholder data - will be fetched from API
  const stats = [
    {
      title: t('moneyIn') || 'Money In',
      value: '$0.00',
      change: { value: 0, type: 'neutral' as const },
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      title: t('moneyOut') || 'Money Out',
      value: '$0.00',
      change: { value: 0, type: 'neutral' as const },
      icon: <TrendingDown className="h-5 w-5" />,
    },
    {
      title: t('pendingReview'),
      value: '0',
      icon: <Clock className="h-5 w-5" />,
    },
    {
      title: t('burnRate'),
      value: '$0.00',
      change: { value: 0, type: 'neutral' as const, period: '/month' },
      icon: <DollarSign className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {t('welcome')}
        </h2>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Here&apos;s an overview of your financial activity
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent documents */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
          <h3 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-50">
            {t('recentDocuments')}
          </h3>
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title={tDoc('noDocuments')}
            description={tDoc('uploadFirst')}
            action={
              <Link href="/documents">
                <Button>{tDoc('upload')}</Button>
              </Link>
            }
          />
        </div>

        {/* Recent transactions */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
          <h3 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-50">
            {t('recentTransactions')}
          </h3>
          <EmptyState
            icon={<CreditCard className="h-8 w-8" />}
            title="No transactions yet"
            description="Import your bank CSV to see transactions"
            action={
              <Link href="/transactions">
                <Button>Import transactions</Button>
              </Link>
            }
          />
        </div>
      </div>

      {/* Category breakdown and top merchants */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category breakdown */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
          <h3 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-50">
            {t('categoryBreakdown')}
          </h3>
          <div className="flex h-48 items-center justify-center text-neutral-400">
            No data available
          </div>
        </div>

        {/* Top merchants */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
          <h3 className="mb-4 text-lg font-medium text-neutral-900 dark:text-neutral-50">
            {t('topMerchants')}
          </h3>
          <div className="flex h-48 items-center justify-center text-neutral-400">
            No data available
          </div>
        </div>
      </div>
    </div>
  );
}
