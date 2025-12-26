import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Moneio - AI Accounting Assistant',
  description: 'AI-powered accounting assistant for small businesses',
};

// Root layout - just provides the basic HTML structure
// Locale-specific layout handles fonts and direction
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
