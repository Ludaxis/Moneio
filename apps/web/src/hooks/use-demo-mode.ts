'use client';

import { useCallback, useEffect, useState } from 'react';

const DEMO_MODE_KEY = 'moneio-demo-mode';

interface DemoModeState {
  /** Whether demo mode is currently active */
  isDemoMode: boolean;
  /** Enable demo mode */
  enableDemoMode: () => void;
  /** Disable demo mode */
  disableDemoMode: () => void;
  /** Toggle demo mode */
  toggleDemoMode: () => void;
  /** Check if demo mode is being loaded from storage */
  isLoading: boolean;
}

/**
 * Hook to manage demo mode state with persistence.
 *
 * Demo mode shows sample data instead of real API data,
 * allowing users to explore the app before connecting their accounts.
 */
export function useDemoMode(): DemoModeState {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load demo mode state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEMO_MODE_KEY);
      if (stored === 'true') {
        setIsDemoMode(true);
      }
    } catch {
      // localStorage not available (SSR or privacy mode)
    }
    setIsLoading(false);
  }, []);

  const enableDemoMode = useCallback(() => {
    setIsDemoMode(true);
    try {
      localStorage.setItem(DEMO_MODE_KEY, 'true');
    } catch {
      // localStorage not available
    }
  }, []);

  const disableDemoMode = useCallback(() => {
    setIsDemoMode(false);
    try {
      localStorage.removeItem(DEMO_MODE_KEY);
    } catch {
      // localStorage not available
    }
  }, []);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => {
      const newValue = !prev;
      try {
        if (newValue) {
          localStorage.setItem(DEMO_MODE_KEY, 'true');
        } else {
          localStorage.removeItem(DEMO_MODE_KEY);
        }
      } catch {
        // localStorage not available
      }
      return newValue;
    });
  }, []);

  return {
    isDemoMode,
    enableDemoMode,
    disableDemoMode,
    toggleDemoMode,
    isLoading,
  };
}

/**
 * Helper to check if we should use demo data.
 * Call this in API route handlers or data fetchers.
 */
export function shouldUseDemoData(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DEMO_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}
