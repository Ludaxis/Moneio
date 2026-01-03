import {
  defaultLocale,
  getDirection,
  getIntlLocale,
  intlLocaleMap,
  localeNames,
  locales,
  rtlLocales,
  type Locale,
} from '@moneio/i18n';
import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

const localeRegex = new RegExp(`^/(${locales.join('|')})`);

// Global formats for consistent formatting across the app
export const formats = {
  dateTime: {
    short: {
      day: 'numeric' as const,
      month: 'short' as const,
      year: 'numeric' as const,
    },
    long: {
      day: 'numeric' as const,
      month: 'long' as const,
      year: 'numeric' as const,
      weekday: 'long' as const,
    },
    monthYear: {
      month: 'short' as const,
      year: '2-digit' as const,
    },
  },
  number: {
    currency: {
      style: 'currency' as const,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
    currencyPrecise: {
      style: 'currency' as const,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
    percent: {
      style: 'percent' as const,
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    },
    decimal: {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  },
};

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  const resolvedLocale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (await import(`../../messages/${resolvedLocale}.json`)).default,
    // Use the correct Intl locale for formatting
    formats,
    timeZone: 'UTC',
    now: new Date(),
  };
});

// Re-export shared types/helpers for convenience within the app
export {
  defaultLocale,
  getDirection,
  getIntlLocale,
  intlLocaleMap,
  locales,
  localeNames,
  rtlLocales,
};
export type { Locale };

export function extractLocaleFromPath(pathname: string): Locale {
  return (pathname.match(localeRegex)?.[1] as Locale) || defaultLocale;
}
