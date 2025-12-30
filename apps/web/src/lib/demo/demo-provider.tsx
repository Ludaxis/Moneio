'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useDemoMode } from '@/hooks/use-demo-mode';

import {
  DEMO_WORKSPACE,
  DEMO_USER,
  DEMO_METRICS,
  DEMO_TRANSACTIONS,
  DEMO_HEALTH_SCORE,
  DEMO_RUNWAY,
  DEMO_AI_INSIGHTS,
  DEMO_PENDING_ACTIONS,
  DEMO_FORECAST,
  DEMO_CATEGORIES,
  type DemoMetrics,
  type DemoTransaction,
  type DemoHealthScore,
  type DemoRunway,
  type DemoAiInsight,
  type DemoPendingAction,
  type DemoForecast,
  type DemoCategory,
} from './demo-data';

interface DemoContextValue {
  /** Whether demo mode is active */
  isDemoMode: boolean;
  /** Loading state for initial hydration */
  isLoading: boolean;
  /** Enable demo mode */
  enableDemoMode: () => void;
  /** Disable demo mode */
  disableDemoMode: () => void;
  /** Toggle demo mode */
  toggleDemoMode: () => void;
  /** Demo workspace data */
  workspace: typeof DEMO_WORKSPACE | null;
  /** Demo user data */
  user: typeof DEMO_USER | null;
  /** Demo dashboard metrics */
  metrics: DemoMetrics | null;
  /** Demo transactions */
  transactions: DemoTransaction[];
  /** Demo health score */
  healthScore: DemoHealthScore | null;
  /** Demo runway data */
  runway: DemoRunway | null;
  /** Demo AI insights */
  aiInsights: DemoAiInsight[];
  /** Demo pending actions */
  pendingActions: DemoPendingAction[];
  /** Demo forecast data */
  forecast: DemoForecast | null;
  /** Demo categories */
  categories: DemoCategory[];
}

const DemoContext = createContext<DemoContextValue | null>(null);

interface DemoProviderProps {
  children: ReactNode;
}

/**
 * Provider component for demo mode.
 *
 * Wraps the app and provides demo data when demo mode is active.
 * Components can use the useDemoContext hook to access demo data
 * or check if demo mode is active.
 */
export function DemoProvider({ children }: DemoProviderProps) {
  const { isDemoMode, isLoading, enableDemoMode, disableDemoMode, toggleDemoMode } = useDemoMode();

  const value = useMemo<DemoContextValue>(() => {
    // When demo mode is active, provide demo data
    if (isDemoMode) {
      return {
        isDemoMode,
        isLoading,
        enableDemoMode,
        disableDemoMode,
        toggleDemoMode,
        workspace: DEMO_WORKSPACE,
        user: DEMO_USER,
        metrics: DEMO_METRICS,
        transactions: DEMO_TRANSACTIONS,
        healthScore: DEMO_HEALTH_SCORE,
        runway: DEMO_RUNWAY,
        aiInsights: DEMO_AI_INSIGHTS,
        pendingActions: DEMO_PENDING_ACTIONS,
        forecast: DEMO_FORECAST,
        categories: DEMO_CATEGORIES,
      };
    }

    // When demo mode is off, return null for all data
    return {
      isDemoMode,
      isLoading,
      enableDemoMode,
      disableDemoMode,
      toggleDemoMode,
      workspace: null,
      user: null,
      metrics: null,
      transactions: [],
      healthScore: null,
      runway: null,
      aiInsights: [],
      pendingActions: [],
      forecast: null,
      categories: [],
    };
  }, [isDemoMode, isLoading, enableDemoMode, disableDemoMode, toggleDemoMode]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/**
 * Hook to access demo mode context.
 *
 * @throws Error if used outside of DemoProvider
 */
export function useDemoContext(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemoContext must be used within a DemoProvider');
  }
  return context;
}

/**
 * Hook to check if demo mode is active.
 * Simpler alternative when you only need the boolean.
 */
export function useIsDemoMode(): boolean {
  const context = useContext(DemoContext);
  return context?.isDemoMode ?? false;
}
