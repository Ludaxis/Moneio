// Core i18n types and helpers shared across the monorepo
export const locales = ['en', 'et', 'fa', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const rtlLocales: Locale[] = ['fa', 'ar'];
export const defaultLocale: Locale = 'en';

export function isRTL(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

export const localeNames: Record<Locale, string> = {
  en: 'English',
  et: 'Eesti',
  fa: 'فارسی',
  ar: 'العربية',
};

// Map app locales to full Intl locale IDs for formatting
export const intlLocaleMap: Record<Locale, string> = {
  en: 'en-US',
  et: 'et-EE',
  fa: 'fa-IR',
  ar: 'ar-SA',
};

export function getIntlLocale(locale: Locale): string {
  return intlLocaleMap[locale] || intlLocaleMap[defaultLocale];
}
