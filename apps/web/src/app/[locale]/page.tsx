'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('common');
  const tNav = useTranslations('navigation');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          {t('appName')}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          AI-powered accounting assistant for small businesses
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {tNav('dashboard')}
          </Link>
          <Link
            href="/documents"
            className="rounded-lg bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground shadow-sm hover:bg-secondary/80"
          >
            {tNav('documents')}
          </Link>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground">Invoice Extraction</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload invoices and receipts. AI extracts all the data automatically.
            </p>
          </div>
          <div className="rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground">Smart Categorization</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Transactions are categorized automatically. Learn from your corrections.
            </p>
          </div>
          <div className="rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground">Financial Insights</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask questions about your finances in plain language. Get instant answers.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
