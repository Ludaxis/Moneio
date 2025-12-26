'use client';

import { useTranslations } from 'next-intl';
import { Bell, Search, User, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@moneio/ui';

interface TopbarProps {
  workspaceName?: string;
}

export function Topbar({ workspaceName = 'My Workspace' }: TopbarProps) {
  const t = useTranslations('common');
  const pathname = usePathname();

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background px-4">
      {/* Search */}
      <div className="flex flex-1 items-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder={t('search')}
            className="h-10 w-full rounded-lg border border-input bg-background ps-10 pe-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center space-x-2">
        {/* Workspace switcher */}
        <button className="flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
          <span>{workspaceName}</span>
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        </button>

        {/* User menu */}
        <Link
          href={`/${locale}/settings/profile`}
          className="flex items-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="User profile"
        >
          <User className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
