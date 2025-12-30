'use client';

import { cn } from '@moneio/ui';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
  BarChart3,
  MessageSquare,
  Settings,
  X,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useCallback } from 'react';

import { createClient as createBrowserClient } from '@/lib/supabase/client';

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
  { href: '/reports', icon: BarChart3, labelKey: 'reports' },
  { href: '/chat', icon: MessageSquare, labelKey: 'chat' },
];

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const t = useTranslations('navigation');
  const tAuth = useTranslations('auth');
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  // Get workspace ID from URL
  const workspaceId = searchParams.get('workspace');

  // Close drawer on escape key
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when drawer is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  // Close drawer on route change
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = `/${locale}/login`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-drawer bg-black/50 transition-opacity md:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-drawer w-72 bg-sidebar shadow-xl transition-transform duration-300 ease-out md:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link href={`/${locale}/dashboard`} className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold">
              M
            </div>
            <span className="text-lg font-semibold text-sidebar-foreground">Moneio</span>
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-sidebar-foreground hover:bg-sidebar-accent touch-target"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.includes(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={`/${locale}${item.href}`}
                  className={cn(
                    'flex items-center rounded-lg px-3 py-3 text-sm font-medium transition-colors touch-target',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="h-5 w-5 me-3" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-4 space-y-1">
          <Link
            href={`/${locale}/workspace/settings${workspaceId ? `?workspace=${workspaceId}` : ''}`}
            className={cn(
              'flex items-center rounded-lg px-3 py-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground touch-target',
              pathname.includes('/workspace/settings') &&
                'bg-sidebar-accent text-sidebar-accent-foreground'
            )}
          >
            <Settings className="h-5 w-5 me-3" />
            <span>{t('settings')}</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center rounded-lg px-3 py-3 text-sm font-medium text-destructive transition-colors hover:bg-sidebar-accent touch-target"
          >
            <LogOut className="h-5 w-5 me-3" />
            <span>{tAuth('signOut')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
