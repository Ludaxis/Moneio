'use client';

import { cn } from '@moneio/ui';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
  PiggyBank,
  Lightbulb,
  Sparkles,
  BarChart3,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { extractLocaleFromPath } from '@/lib/i18n';

interface NavItem {
  href: string;
  icon: React.ElementType;
  labelKey: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { href: '/documents', icon: FileText, labelKey: 'documents' },
  { href: '/invoices', icon: Receipt, labelKey: 'invoices' },
  { href: '/transactions', icon: CreditCard, labelKey: 'transactions' },
  { href: '/subscriptions', icon: PiggyBank, labelKey: 'subscriptions' },
  { href: '/insights', icon: Lightbulb, labelKey: 'insights' },
  { href: '/review', icon: Sparkles, labelKey: 'review' },
  { href: '/reports', icon: BarChart3, labelKey: 'reports' },
  { href: '/chat', icon: MessageSquare, labelKey: 'chat' },
];

interface SidebarProps {
  /** Start in collapsed state (useful for tablet view) */
  defaultCollapsed?: boolean;
}

export function Sidebar({ defaultCollapsed = false }: SidebarProps) {
  const t = useTranslations('navigation');
  const tAccessibility = useTranslations('accessibility');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const locale = extractLocaleFromPath(pathname);

  // Get workspace ID from URL
  const workspaceId = searchParams.get('workspace');

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-e border-sidebar-border bg-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link href={`/${locale}/dashboard`} className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              M
            </div>
            <span className="text-lg font-semibold text-sidebar-foreground">{tCommon('appName')}</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-2 text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label={collapsed ? tAccessibility('expandSidebar') : tAccessibility('collapseSidebar')}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav id="main-navigation" className="flex-1 space-y-1 p-2" aria-label={tAccessibility('mainNavigation')}>
        {navItems.map((item) => {
          const isActive = pathname.includes(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={`/${locale}${item.href}`}
              className={cn(
                'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              <Icon className={cn('h-5 w-5', !collapsed && 'me-3')} />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="border-t border-sidebar-border p-2">
        <Link
          href={`/${locale}/workspace/settings${workspaceId ? `?workspace=${workspaceId}` : ''}`}
          className={cn(
            'flex items-center rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            pathname.includes('/workspace/settings') &&
              'bg-sidebar-accent text-sidebar-accent-foreground',
            collapsed && 'justify-center px-2'
          )}
        >
          <Settings className={cn('h-5 w-5', !collapsed && 'me-3')} />
          {!collapsed && <span>{t('settings')}</span>}
        </Link>
      </div>
    </aside>
  );
}
