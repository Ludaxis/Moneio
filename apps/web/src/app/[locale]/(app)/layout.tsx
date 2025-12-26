import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function AppLayout({ children, params: { locale } }: AppLayoutProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-950">
      <Sidebar locale={locale} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
