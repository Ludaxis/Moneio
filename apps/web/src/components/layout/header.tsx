'use client';

import { useTranslations } from 'next-intl';
import { Bell, Search, User } from 'lucide-react';
import { Button, Input } from '@moneio/ui';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const t = useTranslations('common');

  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center gap-4">
        {title && (
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            type="search"
            placeholder={t('search')}
            className="w-64 pl-9"
          />
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger-500" />
        </Button>

        {/* User menu */}
        <Button variant="ghost" size="icon">
          <User className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
