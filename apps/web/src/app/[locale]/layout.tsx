import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider, useMessages } from 'next-intl';
import { getDirection, type Locale } from '@moneio/i18n';
import '@moneio/ui/tokens.css';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Moneio - AI Accounting Assistant',
  description: 'AI-powered accounting assistant for small businesses',
};

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: Locale };
}

export default function LocaleLayout({ children, params: { locale } }: LocaleLayoutProps) {
  const messages = useMessages();
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
