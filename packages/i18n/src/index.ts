// Internationalization package
// Supports: en, et, fa (RTL), ar (RTL)

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
