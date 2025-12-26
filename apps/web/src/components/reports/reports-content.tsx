'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent, StatCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@moneio/ui';

export function ReportsContent() {
  const t = useTranslations('reports');
  const [period, setPeriod] = useState('thisMonth');

  const periods = [
    { value: 'thisMonth', label: t('thisMonth') },
    { value: 'lastMonth', label: t('lastMonth') },
    { value: 'thisQuarter', label: t('thisQuarter') },
    { value: 'thisYear', label: t('thisYear') },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="w-48">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Report tabs */}
      <Tabs defaultValue="cashflow">
        <TabsList>
          <TabsTrigger value="cashflow">{t('cashflow')}</TabsTrigger>
          <TabsTrigger value="vat">{t('vat')}</TabsTrigger>
          <TabsTrigger value="pnl">{t('profitLoss')}</TabsTrigger>
        </TabsList>

        {/* Cashflow Report */}
        <TabsContent value="cashflow" className="mt-6">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                title={t('moneyIn')}
                value="$0.00"
                icon={<TrendingUp className="h-5 w-5 text-success-600" />}
              />
              <StatCard
                title={t('moneyOut')}
                value="$0.00"
                icon={<TrendingDown className="h-5 w-5 text-danger-600" />}
              />
              <StatCard
                title={t('netChange')}
                value="$0.00"
                icon={<DollarSign className="h-5 w-5 text-primary-600" />}
              />
            </div>

            {/* Cashflow chart placeholder */}
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
              <h3 className="mb-4 text-lg font-medium">Monthly Cashflow</h3>
              <div className="flex h-64 items-center justify-center text-neutral-400">
                Chart will be displayed here
              </div>
            </div>

            {/* Monthly breakdown table */}
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
              <h3 className="mb-4 text-lg font-medium">Monthly Breakdown</h3>
              <div className="flex h-48 items-center justify-center text-neutral-400">
                No data available
              </div>
            </div>
          </div>
        </TabsContent>

        {/* VAT Report */}
        <TabsContent value="vat" className="mt-6">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                title={t('vatCollected')}
                value="$0.00"
                icon={<Percent className="h-5 w-5 text-success-600" />}
              />
              <StatCard
                title={t('vatPaid')}
                value="$0.00"
                icon={<Percent className="h-5 w-5 text-danger-600" />}
              />
              <StatCard
                title={t('netVat')}
                value="$0.00"
                icon={<DollarSign className="h-5 w-5 text-primary-600" />}
              />
            </div>

            {/* VAT details */}
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
              <h3 className="mb-4 text-lg font-medium">VAT by Rate</h3>
              <div className="flex h-48 items-center justify-center text-neutral-400">
                No data available
              </div>
            </div>

            {/* Invoices with VAT */}
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
              <h3 className="mb-4 text-lg font-medium">Invoices with VAT</h3>
              <div className="flex h-48 items-center justify-center text-neutral-400">
                No invoices with VAT
              </div>
            </div>
          </div>
        </TabsContent>

        {/* P&L Report */}
        <TabsContent value="pnl" className="mt-6">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                title="Total Income"
                value="$0.00"
                icon={<TrendingUp className="h-5 w-5 text-success-600" />}
              />
              <StatCard
                title="Total Expenses"
                value="$0.00"
                icon={<TrendingDown className="h-5 w-5 text-danger-600" />}
              />
              <StatCard
                title="Net Profit"
                value="$0.00"
                icon={<DollarSign className="h-5 w-5 text-primary-600" />}
              />
            </div>

            {/* Category breakdown */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
                <h3 className="mb-4 text-lg font-medium">Income by Category</h3>
                <div className="flex h-48 items-center justify-center text-neutral-400">
                  No data available
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800">
                <h3 className="mb-4 text-lg font-medium">Expenses by Category</h3>
                <div className="flex h-48 items-center justify-center text-neutral-400">
                  No data available
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
