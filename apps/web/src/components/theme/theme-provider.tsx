'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

/**
 * ThemeProvider - Wraps the app with next-themes for dark/light mode support
 *
 * Features:
 * - System preference detection
 * - No flash on page load
 * - Persists preference to localStorage
 * - Adds 'dark' class to <html> for Tailwind
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
