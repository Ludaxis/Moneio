'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Receipt,
  BarChart3,
  MessageSquare,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { cn, Button } from '@moneio/ui';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  locale: string;
}

export function Sidebar({ locale }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { href: `/${locale}/dashboard`, label: t('dashboard'), icon: LayoutDashboard },
    { href: `/${locale}/documents`, label: t('documents'), icon: FileText },
    { href: `/${locale}/transactions`, label: t('transactions'), icon: CreditCard },
    { href: `/${locale}/invoices`, label: t('invoices'), icon: Receipt },
    { href: `/${locale}/reports`, label: t('reports'), icon: BarChart3 },
    { href: `/${locale}/chat`, label: t('chat'), icon: MessageSquare },
  ];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/login`);
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-neutral-200 px-6 dark:border-neutral-700">
        <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold">
            M
          </div>
          <span className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
            Moneio
          </span>
        </Link>
      </div>

      {/* Workspace selector */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
        <button className="flex w-full items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-50">
            My Workspace
          </span>
          <ChevronDown className="h-4 w-4 text-neutral-500" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-700">
        <Link
          href={`/${locale}/settings`}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50',
            pathname.includes('/settings') && 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50'
          )}
        >
          <Settings className="h-5 w-5" />
          {t('settings')}
        </Link>
        <button
          onClick={handleSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
