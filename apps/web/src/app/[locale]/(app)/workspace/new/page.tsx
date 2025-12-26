'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const currencies = [
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'CZK', name: 'Czech Koruna' },
];

export default function NewWorkspacePage() {
  const t = useTranslations('workspace');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, baseCurrency }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create workspace');
      }

      const workspace = await response.json();
      router.push(`/dashboard?workspace=${workspace.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-foreground">{t('create')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create a new workspace to start tracking your finances.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground">
            {t('name')}
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="My Business"
          />
        </div>

        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-foreground">
            {t('currency')}
          </label>
          <select
            id="currency"
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Default currency for reporting. You can still use other currencies.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 rounded-lg border border-input bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-accent"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || !name}
            className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? tCommon('loading') : tCommon('create')}
          </button>
        </div>
      </form>
    </div>
  );
}
