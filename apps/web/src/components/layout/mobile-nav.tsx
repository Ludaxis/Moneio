'use client';

import { cn } from '@moneio/ui';
import { LayoutDashboard, FileText, CreditCard, MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface NavItem {
  href: string;
  icon: React.ElementType;
  labelKey: string;
}

// Mobile bottom nav shows 5 items (subset of main navigation)
const mobileNavItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { href: '/documents', icon: FileText, labelKey: 'documents' },
  // Center position reserved for FAB
  { href: '/transactions', icon: CreditCard, labelKey: 'transactions' },
  { href: '/chat', icon: MessageSquare, labelKey: 'chat' },
];

interface MobileNavProps {
  onFabClick?: () => void;
}

export function MobileNav({ onFabClick }: MobileNavProps) {
  const t = useTranslations('navigation');
  const pathname = usePathname();

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  return (
    <nav
      id="main-navigation"
      className="fixed inset-x-0 bottom-0 z-fixed border-t border-border bg-background/95 backdrop-blur-sm md:hidden"
      style={{ height: 'var(--bottom-nav-height)' }}
      aria-label="Main navigation"
    >
      <div className="relative mx-auto flex h-full max-w-lg items-center justify-around px-4">
        {/* Left nav items (2 items) */}
        {mobileNavItems.slice(0, 2).map((item) => {
          const isActive = pathname.includes(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={`/${locale}${item.href}`}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2 px-3 touch-target transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {/* Center FAB - AI Quick Action */}
        <div className="relative -mt-6">
          <button
            onClick={onFabClick}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full',
              'bg-gradient-to-br from-ai to-primary shadow-lg',
              'text-white transition-transform active:scale-95',
              'touch-target'
            )}
            aria-label="AI Quick Actions"
          >
            <Sparkles className="h-6 w-6" />
          </button>
        </div>

        {/* Right nav items (2 items) */}
        {mobileNavItems.slice(2).map((item) => {
          const isActive = pathname.includes(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={`/${locale}${item.href}`}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2 px-3 touch-target transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
