'use client';

import { useLocale } from 'next-intl';

const rtlLocales = ['fa', 'ar'];

/**
 * Hook to check if the current locale is RTL
 */
export function useIsRTL(): boolean {
  const locale = useLocale();
  return rtlLocales.includes(locale);
}

/**
 * Hook to get the current text direction
 */
export function useDirection(): 'ltr' | 'rtl' {
  const isRTL = useIsRTL();
  return isRTL ? 'rtl' : 'ltr';
}
