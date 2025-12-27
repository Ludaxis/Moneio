import { Inter, Noto_Sans_Arabic, Vazirmatn } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { locales, getDirection, type Locale } from '@/lib/i18n';

// Latin font (default)
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
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

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function LocaleLayout({ children, params: { locale } }: LocaleLayoutProps) {
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  const messages = await getMessages();
  const direction = getDirection(locale as Locale);

  // Select appropriate font classes based on locale
  const fontClasses = getFontClasses(locale as Locale);

  return (
    <html lang={locale} dir={direction} className={fontClasses} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

function getFontClasses(locale: Locale): string {
  const baseClasses = `${inter.variable} ${notoSansArabic.variable} ${vazirmatn.variable}`;

  // RTL languages use their specific fonts as primary
  switch (locale) {
    case 'fa':
      return `${baseClasses} font-persian`;
    case 'ar':
      return `${baseClasses} font-arabic`;
    default:
      return `${baseClasses} font-sans`;
  }
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
