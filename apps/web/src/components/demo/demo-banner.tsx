'use client';

import { cn } from '@moneio/ui';
import { Sparkles, X } from 'lucide-react';

import { useDemoContext } from '@/lib/demo/demo-provider';

interface DemoBannerProps {
  className?: string;
}

/**
 * Banner displayed when demo mode is active.
 * Shows at the top of the app to indicate the user is viewing sample data.
 */
export function DemoBanner({ className }: DemoBannerProps) {
  const { isDemoMode, disableDemoMode, isLoading } = useDemoContext();

  // Don't render during loading or when demo mode is off
  if (isLoading || !isDemoMode) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative flex items-center justify-center gap-2 px-4 py-2 text-sm',
        'bg-gradient-to-r from-ai via-primary to-ai text-white',
        className
      )}
    >
      <Sparkles className="h-4 w-4 animate-pulse-soft" />
      <span className="font-medium">Demo Mode</span>
      <span className="hidden sm:inline">
        <span className="mx-2">—</span>
        <span>You're viewing sample data.</span>
      </span>
      <button
        onClick={disableDemoMode}
        className="ms-2 underline decoration-white/50 underline-offset-2 hover:decoration-white transition-colors"
      >
        Exit Demo
      </button>
      <button
        onClick={disableDemoMode}
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/20 transition-colors"
        aria-label="Close demo banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
