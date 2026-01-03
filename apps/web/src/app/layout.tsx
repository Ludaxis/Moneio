import { defaultLocale, getDirection, locales, type Locale } from '@moneio/i18n';
import { cn } from '@moneio/ui';
import type { Metadata } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Noto_Sans_Arabic,
  Plus_Jakarta_Sans,
  Vazirmatn,
} from 'next/font/google';
import { cookies, headers } from 'next/headers';

import { ThemeProvider } from '@/components/theme';

import './globals.css';

// Display font - for headings and important text
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

// Body font - for general text
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Monospace font - for financial numbers and code
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

// Arabic font
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-arabic',
});

// Persian font (Vazirmatn from Google Fonts)
const vazirmatn = Vazirmatn({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-vazirmatn',
});

export const metadata: Metadata = {
  title: 'Moneio - AI Accounting Assistant',
  description: 'AI-powered accounting assistant for small businesses',
};

function resolveLocale(): Locale {
  const cookieLocale = cookies().get('NEXT_LOCALE')?.value;
  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  const acceptLanguage = headers().get('accept-language');
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(',').map((l) => l.split(';')[0]?.trim());
    const exact = preferred.find((code) => locales.includes(code as Locale));
    if (exact) return exact as Locale;

    const base = preferred
      .map((code) => code?.split('-')?.[0])
      .find((code) => locales.includes(code as Locale));
    if (base) return base as Locale;
  }

  return defaultLocale;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale();
  const direction = getDirection(locale);
  const fontClass =
    locale === 'fa' ? 'font-persian' : locale === 'ar' ? 'font-arabic' : 'font-sans';

  return (
    <html lang={locale} dir={direction} className={fontClass} suppressHydrationWarning>
      <body
        className={cn(
          plusJakartaSans.variable,
          inter.variable,
          jetbrainsMono.variable,
          notoSansArabic.variable,
          vazirmatn.variable,
          'min-h-screen bg-background font-body antialiased'
        )}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
