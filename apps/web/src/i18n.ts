import { getRequestConfig } from 'next-intl/server';
import { locales, type Locale } from '@moneio/i18n';

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming locale is valid
  if (!locales.includes(locale as Locale)) {
    return {
      messages: (await import(`@moneio/i18n/messages/en.json`)).default,
    };
  }

  return {
    messages: (await import(`@moneio/i18n/messages/${locale}.json`)).default,
  };
});
