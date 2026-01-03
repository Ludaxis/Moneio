'use client';

import { cn } from '@moneio/ui';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useRef } from 'react';

import { extractLocaleFromPath } from '@/lib/i18n';

const currencies = [
  { code: 'USD', nameKey: 'usDollar' },
  { code: 'EUR', nameKey: 'euro' },
  { code: 'IRR', nameKey: 'iranianRial' },
  { code: 'AED', nameKey: 'uaeDirham' },
  { code: 'GBP', nameKey: 'britishPound' },
  { code: 'CHF', nameKey: 'swissFranc' },
  { code: 'SEK', nameKey: 'swedishKrona' },
  { code: 'NOK', nameKey: 'norwegianKrone' },
  { code: 'DKK', nameKey: 'danishKrone' },
  { code: 'PLN', nameKey: 'polishZloty' },
  { code: 'CZK', nameKey: 'czechKoruna' },
];

const CREATION_STEPS = [
  { id: 'workspace', label: 'Creating workspace', duration: 500 },
  { id: 'user', label: 'Setting up user', duration: 300 },
  { id: 'categories', label: 'Adding default categories', duration: 800 },
  { id: 'accounts', label: 'Setting up chart of accounts', duration: 600 },
  { id: 'complete', label: 'Almost done', duration: 400 },
];

export default function NewWorkspacePage() {
  const t = useTranslations('workspace');
  const tCommon = useTranslations('common');
  const tCurrencies = useTranslations('currencies');
  const router = useRouter();
  const pathname = usePathname();
  const locale = extractLocaleFromPath(pathname);

  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const workspaceIdRef = useRef<string | null>(null);

  // Animate through steps when creating
  useEffect(() => {
    if (!showOverlay || isComplete) return;

    const totalDuration = CREATION_STEPS.reduce((acc, step) => acc + step.duration, 0);
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 50;
      const newProgress = Math.min((elapsed / totalDuration) * 100, 95);
      setProgress(newProgress);

      // Calculate which step we're on
      let accumulated = 0;
      for (let i = 0; i < CREATION_STEPS.length; i++) {
        accumulated += CREATION_STEPS[i].duration;
        if (elapsed <= accumulated) {
          setCurrentStep(i);
          break;
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [showOverlay, isComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowOverlay(true);
    setProgress(0);
    setCurrentStep(0);
    setIsComplete(false);

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
      workspaceIdRef.current = workspace.id;

      // Complete the progress animation
      setProgress(100);
      setCurrentStep(CREATION_STEPS.length - 1);
      setIsComplete(true);

      // Wait a moment to show completion, then redirect
      setTimeout(() => {
        router.push(`/${locale}/dashboard?workspace=${workspace.id}`);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setShowOverlay(false);
      setLoading(false);
    }
  };

  return (
    <>
      {/* Progress Overlay */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
            {/* Icon */}
            <div className="flex justify-center">
              {isComplete ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                  <CheckCircle2 className="h-10 w-10 text-success" />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
              )}
            </div>

            {/* Title */}
            <h2 className="mt-6 text-center text-xl font-semibold text-foreground">
              {isComplete ? 'Workspace Created!' : 'Creating Your Workspace'}
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {isComplete
                ? `Redirecting to ${name}...`
                : 'Please wait while we set everything up for you.'}
            </p>

            {/* Progress Bar */}
            <div className="mt-8">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full transition-all duration-300 ease-out',
                    isComplete ? 'bg-success' : 'bg-primary'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{CREATION_STEPS[currentStep]?.label || 'Initializing...'}</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>

            {/* Steps List */}
            <div className="mt-6 space-y-2">
              {CREATION_STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
                    index < currentStep && 'text-success',
                    index === currentStep && !isComplete && 'bg-primary/5 text-primary',
                    index === currentStep && isComplete && 'bg-success/5 text-success',
                    index > currentStep && 'text-muted-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium',
                      index < currentStep && 'bg-success text-success-foreground',
                      index === currentStep && !isComplete && 'bg-primary text-primary-foreground',
                      index === currentStep && isComplete && 'bg-success text-success-foreground',
                      index > currentStep && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {index < currentStep || (index === currentStep && isComplete) ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Form */}
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
                  {currency.code} - {tCurrencies(currency.nameKey)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('currencyDescription')}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
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
    </>
  );
}
