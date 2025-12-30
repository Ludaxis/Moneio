'use client';

import { cn } from '@moneio/ui';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export interface ThemeToggleProps {
  /** Show labels alongside icons */
  showLabels?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

const themes = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/**
 * ThemeToggle - Switch between light, dark, and system themes
 *
 * Features:
 * - Three-way toggle (light/dark/system)
 * - Animated indicator
 * - Accessible keyboard navigation
 * - Avoids hydration mismatch
 */
export function ThemeToggle({ showLabels = false, size = 'md', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          'flex items-center rounded-lg bg-muted p-1',
          size === 'sm' && 'gap-0.5',
          size === 'md' && 'gap-1',
          size === 'lg' && 'gap-1.5',
          className
        )}
      >
        {themes.map((t) => (
          <div
            key={t.value}
            className={cn(
              'rounded-md bg-transparent',
              size === 'sm' && 'h-7 w-7',
              size === 'md' && 'h-8 w-8',
              size === 'lg' && 'h-9 w-9',
              showLabels && 'w-auto px-3'
            )}
          />
        ))}
      </div>
    );
  }

  const sizeStyles = {
    sm: {
      button: 'h-7 w-7',
      icon: 'h-3.5 w-3.5',
      text: 'text-xs',
    },
    md: {
      button: 'h-8 w-8',
      icon: 'h-4 w-4',
      text: 'text-sm',
    },
    lg: {
      button: 'h-9 w-9',
      icon: 'h-5 w-5',
      text: 'text-sm',
    },
  };

  return (
    <div
      className={cn(
        'flex items-center rounded-lg bg-muted p-1',
        size === 'sm' && 'gap-0.5',
        size === 'md' && 'gap-1',
        size === 'lg' && 'gap-1.5',
        className
      )}
      role="radiogroup"
      aria-label="Theme selection"
    >
      {themes.map((t) => {
        const Icon = t.icon;
        const isActive = theme === t.value;

        return (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={cn(
              'flex items-center justify-center rounded-md transition-all duration-200',
              sizeStyles[size].button,
              showLabels && 'w-auto px-3 gap-1.5',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            role="radio"
            aria-checked={isActive}
            aria-label={t.label}
          >
            <Icon className={sizeStyles[size].icon} />
            {showLabels && <span className={sizeStyles[size].text}>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Simple theme toggle button (cycles through themes)
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  if (!mounted) {
    return (
      <button
        className={cn(
          'rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
          className
        )}
        aria-label="Toggle theme"
      >
        <Sun className="h-5 w-5" />
      </button>
    );
  }

  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
        className
      )}
      aria-label={`Current theme: ${theme}. Click to change.`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/**
 * Theme selector for settings page
 */
export function ThemeSelector({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={cn('h-[120px] animate-pulse rounded-lg bg-muted', className)} />;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-3 gap-3">
        {themes.map((t) => {
          const Icon = t.icon;
          const isActive = theme === t.value;

          return (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span
                className={cn(
                  'text-sm font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {theme === 'system'
          ? 'Theme will automatically match your system preference.'
          : `Using ${theme} mode.`}
      </p>
    </div>
  );
}
