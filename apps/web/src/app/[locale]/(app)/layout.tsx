import { CalendarProviderWrapper } from '@/components/calendar-provider-wrapper';
import { AppShell } from '@/components/layout';
import { WorkspaceProvider } from '@/lib/workspace';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <WorkspaceProvider>
      <CalendarProviderWrapper>
        <AppShell>{children}</AppShell>
      </CalendarProviderWrapper>
    </WorkspaceProvider>
  );
}
