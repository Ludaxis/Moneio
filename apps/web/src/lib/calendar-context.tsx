'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type CalendarSystem = 'gregorian' | 'jalali';

interface CalendarContextValue {
  calendarSystem: CalendarSystem;
}

const CalendarContext = createContext<CalendarContextValue>({
  calendarSystem: 'gregorian',
});

interface CalendarProviderProps {
  children: ReactNode;
  calendarSystem: CalendarSystem;
}

/**
 * Provider for the calendar system preference
 * Wraps the app to provide access to the workspace's calendar setting
 */
export function CalendarProvider({ children, calendarSystem }: CalendarProviderProps) {
  return (
    <CalendarContext.Provider value={{ calendarSystem }}>{children}</CalendarContext.Provider>
  );
}

/**
 * Hook to access the current calendar system
 * Returns 'gregorian' or 'jalali'
 */
export function useCalendarSystem(): CalendarSystem {
  const context = useContext(CalendarContext);
  return context.calendarSystem;
}

/**
 * Hook to check if the calendar system is Jalali
 */
export function useIsJalali(): boolean {
  const calendarSystem = useCalendarSystem();
  return calendarSystem === 'jalali';
}
