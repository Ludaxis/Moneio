'use client';

import { useTranslations } from 'next-intl';

export default function DashboardPage() {
  const t = useTranslations('navigation');
  const tReports = useTranslations('reports');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[tReports('income'), tReports('expenses'), tReports('profit'), 'Pending'].map(
          (label) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-card p-6"
            >
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                €0.00
              </p>
            </div>
          )
        )}
      </div>

      {/* Placeholder Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            {tReports('cashflow')}
          </h2>
          <div className="mt-4 h-64 skeleton rounded" />
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Recent Activity
          </h2>
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 skeleton rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
