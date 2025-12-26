import createMiddleware from 'next-intl/middleware';

import { locales, defaultLocale } from './lib/i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Don't redirect the default locale
  localePrefix: 'as-needed',
});

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(en|et|fa|ar)/:path*'],
};
