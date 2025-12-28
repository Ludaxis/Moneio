'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function ReportsPage() {
  const tNav = useTranslations('navigation');
  const tCommon = useTranslations('common');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{tNav('reports')}</h1>
        <Link href="/" className="text-sm text-primary hover:underline">
          {tCommon('back')}
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Reports dashboard coming soon. You can still view documents and transactions while we build
        KPI charts.
      </div>
    </div>
  );
}
