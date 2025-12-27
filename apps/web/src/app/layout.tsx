import type { Metadata } from 'next';
import { Inter, Noto_Sans_Arabic, Vazirmatn } from 'next/font/google';

import './globals.css';

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

export const metadata: Metadata = {
  title: 'Moneio - AI Accounting Assistant',
  description: 'AI-powered accounting assistant for small businesses',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${notoSansArabic.variable} ${vazirmatn.variable} min-h-screen bg-background font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
