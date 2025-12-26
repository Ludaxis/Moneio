'use client';

import { useTranslations } from 'next-intl';
import { Bell, Search, User, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { WorkspaceSwitcher } from '@/components/workspace';
import { createBrowserClient } from '@/lib/supabase';

export function Topbar() {
  const t = useTranslations('common');
  const tAuth = useTranslations('auth');
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  };

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
      <div className="flex items-center gap-2">
        {/* Workspace switcher */}
        <WorkspaceSwitcher />

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="User menu"
          >
            <User className="h-5 w-5" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute end-0 z-50 mt-2 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
                <Link
                  href={`/${locale}/settings/profile`}
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                >
                  <User className="h-4 w-4" />
                  Profile
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" />
                  {tAuth('signOut')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
