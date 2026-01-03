'use client';

import { CalendarProvider, type CalendarSystem } from '@/lib/calendar-context';
import { useWorkspace } from '@/lib/workspace';

interface CalendarProviderWrapperProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that reads the workspace's calendar system
 * and provides it through the CalendarProvider context.
 */
export function CalendarProviderWrapper({ children }: CalendarProviderWrapperProps) {
  const { workspace } = useWorkspace();

  // Default to 'gregorian' if no workspace or calendar system is set
  const calendarSystem: CalendarSystem =
    (workspace?.calendarSystem as CalendarSystem) || 'gregorian';

  return <CalendarProvider calendarSystem={calendarSystem}>{children}</CalendarProvider>;
}
