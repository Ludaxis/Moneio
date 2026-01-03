'use client';

import { localeNames, locales, type Locale } from '@moneio/i18n';
import { cn } from '@moneio/ui';
import { ChevronDown, Globe, Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useRef, useEffect, useTransition } from 'react';

const LOCALE_META: Array<{ code: Locale; nativeName: string; flag: string }> = [
  { code: 'en', nativeName: localeNames.en, flag: '🇺🇸' },
  { code: 'et', nativeName: localeNames.et, flag: '🇪🇪' },
  { code: 'fa', nativeName: localeNames.fa, flag: '🇮🇷' },
  { code: 'ar', nativeName: localeNames.ar, flag: '🇸🇦' },
];

interface LocaleSwitcherProps {
  /** Compact mode - just show icon */
  compact?: boolean;
  /** Additional className */
  className?: string;
}

export function LocaleSwitcher({ compact = false, className }: LocaleSwitcherProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLocale =
    LOCALE_META.find((l) => l.code === locale) || LOCALE_META.find((l) => l.code === 'en')!;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleLocaleChange = (newLocale: Locale) => {
    const segments = pathname.split('/');
    const hasLocale = locales.some((l) => l === segments[1]);
    if (hasLocale) {
      segments[1] = newLocale;
    } else {
      segments.splice(1, 0, newLocale);
    }

    const newPath = segments.join('/') || '/';
    const params = new URLSearchParams(searchParams.toString());
    const href = params.toString() ? `${newPath}?${params.toString()}` : newPath;

    setIsOpen(false);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className={cn(
          'flex items-center gap-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors touch-target',
          compact ? 'p-2' : 'px-3 py-2',
          isPending && 'opacity-70 cursor-wait'
        )}
        aria-label={t('language')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Globe className="h-5 w-5" />}
        {!compact && (
          <>
            <span className="text-sm font-medium">{currentLocale.nativeName}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
          </>
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-2 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg',
            // Position based on RTL
            'end-0'
          )}
          role="listbox"
          aria-label={t('language')}
        >
          {LOCALE_META.map((loc) => (
            <button
              key={loc.code}
              onClick={() => handleLocaleChange(loc.code)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                loc.code === locale
                  ? 'bg-accent text-accent-foreground'
                  : 'text-popover-foreground hover:bg-accent/50'
              )}
              role="option"
              aria-selected={loc.code === locale}
            >
              <span className="text-base">{loc.flag}</span>
              <span className="flex-1 text-start">{loc.nativeName}</span>
              {loc.code === locale && <span className="text-xs text-muted-foreground">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
