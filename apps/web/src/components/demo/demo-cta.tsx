'use client';

import { cn } from '@moneio/ui';
import { Play, Sparkles } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

import { useDemoMode } from '@/hooks/use-demo-mode';

interface DemoCTAProps {
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
  /** Show AI sparkle icon */
  showIcon?: boolean;
  /** Custom label text */
  label?: string;
}

/**
 * Call-to-action button for entering demo mode.
 * Use on login page, landing page, or marketing pages.
 */
export function DemoCTA({
  variant = 'secondary',
  size = 'md',
  className,
  showIcon = true,
  label = 'Try Demo',
}: DemoCTAProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { enableDemoMode } = useDemoMode();

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const handleClick = () => {
    enableDemoMode();
    router.push(`/${locale}/dashboard`);
  };

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  const variantClasses = {
    primary: cn(
      'bg-gradient-to-r from-ai to-primary text-white',
      'hover:from-ai/90 hover:to-primary/90',
      'shadow-md hover:shadow-lg'
    ),
    secondary: cn(
      'bg-secondary text-secondary-foreground',
      'hover:bg-secondary/80',
      'border border-border'
    ),
    ghost: cn('text-muted-foreground hover:text-foreground hover:bg-accent'),
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {showIcon && (
        <span className="relative">
          <Play className="h-4 w-4" />
          <Sparkles className="absolute -top-1 -end-1 h-2.5 w-2.5 text-ai animate-pulse-soft" />
        </span>
      )}
      <span>{label}</span>
    </button>
  );
}

/**
 * Large hero-style CTA for landing pages.
 */
export function DemoHeroCTA({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { enableDemoMode } = useDemoMode();

  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const handleClick = () => {
    enableDemoMode();
    router.push(`/${locale}/dashboard`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'group relative inline-flex items-center justify-center gap-3',
        'h-14 px-8 text-lg font-semibold',
        'rounded-xl',
        'bg-gradient-to-r from-ai via-primary to-ai bg-[length:200%_100%]',
        'text-white',
        'shadow-lg shadow-primary/25',
        'hover:bg-[position:100%_0] hover:shadow-xl hover:shadow-primary/30',
        'transition-all duration-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      <Sparkles className="h-5 w-5 animate-pulse-soft" />
      <span>Try Interactive Demo</span>
      <span className="text-white/70 text-sm font-normal">No signup required</span>
    </button>
  );
}
