import type { Metadata } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Noto_Sans_Arabic,
  Plus_Jakarta_Sans,
  Vazirmatn,
} from 'next/font/google';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${plusJakartaSans.variable} ${inter.variable} ${jetbrainsMono.variable} ${notoSansArabic.variable} ${vazirmatn.variable} min-h-screen bg-background font-body antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
