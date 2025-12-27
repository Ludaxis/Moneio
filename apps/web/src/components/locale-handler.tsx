'use client';

import { useEffect } from 'react';

import { getDirection, type Locale } from '@/lib/i18n';

interface LocaleHandlerProps {
  locale: Locale;
}

/**
 * Client component that updates the html element's lang and dir attributes
 * based on the current locale. This is needed because the root layout
 * must have static html/body tags in Next.js 14.
 */
export function LocaleHandler({ locale }: LocaleHandlerProps) {
  useEffect(() => {
    const html = document.documentElement;
    const direction = getDirection(locale);

    html.setAttribute('lang', locale);
    html.setAttribute('dir', direction);

    // Add font class for RTL languages
    html.classList.remove('font-persian', 'font-arabic', 'font-sans');
    switch (locale) {
      case 'fa':
        html.classList.add('font-persian');
        break;
      case 'ar':
        html.classList.add('font-arabic');
        break;
      default:
        html.classList.add('font-sans');
    }
  }, [locale]);

  return null;
}
