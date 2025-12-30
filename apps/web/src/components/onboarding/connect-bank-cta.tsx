'use client';

import { cn } from '@moneio/ui';
import { Building2, ArrowRight, Shield, Zap, RefreshCw } from 'lucide-react';

export interface ConnectBankCTAProps {
  /** Handler for connect action */
  onConnect?: () => void;
  /** Handler for demo mode */
  onDemo?: () => void;
  /** Variant style */
  variant?: 'card' | 'banner' | 'inline';
  /** Additional className */
  className?: string;
}

const features = [
  {
    icon: Zap,
    title: 'Automatic sync',
    description: 'Transactions imported daily',
  },
  {
    icon: Shield,
    title: 'Bank-level security',
    description: 'Read-only, encrypted access',
  },
  {
    icon: RefreshCw,
    title: 'Smart categorization',
    description: 'AI learns your patterns',
  },
];

/**
 * ConnectBankCTA - Prominent call-to-action for bank connection
 *
 * Multiple variants for different placements:
 * - card: Full card with features list
 * - banner: Horizontal banner
 * - inline: Compact inline version
 */
export function ConnectBankCTA({
  onConnect,
  onDemo,
  variant = 'card',
  className,
}: ConnectBankCTAProps) {
  if (variant === 'banner') {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row items-center justify-between gap-4',
          'rounded-lg border border-primary/20 bg-primary/5 p-4',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Connect your bank account
            </h3>
            <p className="text-xs text-muted-foreground">
              Auto-sync transactions and get AI insights
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onDemo && (
            <button
              onClick={onDemo}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Try Demo
            </button>
          )}
          <button
            onClick={onConnect}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2',
              'bg-primary text-primary-foreground text-sm font-medium',
              'hover:bg-primary/90 transition-colors'
            )}
          >
            Connect
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center justify-between p-3 rounded-lg bg-muted/50',
          className
        )}
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Connect bank for live data
          </span>
        </div>
        <button
          onClick={onConnect}
          className="text-sm font-medium text-primary hover:underline"
        >
          Connect
        </button>
      </div>
    );
  }

  // Card variant (default)
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Connect your bank
            </h3>
            <p className="text-sm text-muted-foreground">
              Unlock the full power of Moneio
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="grid gap-3 mt-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {feature.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 p-4 bg-muted/30 border-t border-border">
        <button
          onClick={onConnect}
          className={cn(
            'flex-1 inline-flex items-center justify-center gap-2',
            'rounded-lg px-4 py-2.5',
            'bg-primary text-primary-foreground text-sm font-medium',
            'hover:bg-primary/90 transition-colors'
          )}
        >
          <Building2 className="h-4 w-4" />
          Connect Bank Account
        </button>
        {onDemo && (
          <button
            onClick={onDemo}
            className={cn(
              'px-4 py-2.5 rounded-lg',
              'text-sm font-medium text-muted-foreground',
              'hover:text-foreground hover:bg-muted transition-colors'
            )}
          >
            Try Demo
          </button>
        )}
      </div>

      {/* Trust badge */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-muted/50 text-xs text-muted-foreground">
        <Shield className="h-3 w-3" />
        <span>Bank-grade security • Read-only access • Your data is safe</span>
      </div>
    </div>
  );
}

/**
 * Compact bank connection prompt
 */
export function BankConnectionPrompt({
  connected,
  bankName,
  lastSynced,
  onConnect,
  onRefresh,
  className,
}: {
  connected?: boolean;
  bankName?: string;
  lastSynced?: Date;
  onConnect?: () => void;
  onRefresh?: () => void;
  className?: string;
}) {
  if (connected) {
    return (
      <div
        className={cn(
          'flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/20',
          className
        )}
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <span className="text-sm text-foreground">{bankName || 'Bank connected'}</span>
          {lastSynced && (
            <span className="text-xs text-muted-foreground">
              · Synced {lastSynced.toLocaleDateString()}
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-warning" />
        <span className="text-sm text-foreground">No bank connected</span>
      </div>
      <button
        onClick={onConnect}
        className="text-xs font-medium text-primary hover:underline"
      >
        Connect now
      </button>
    </div>
  );
}
