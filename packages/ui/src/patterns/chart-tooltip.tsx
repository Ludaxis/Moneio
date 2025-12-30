'use client';

import { cn } from '../utils';

export interface ChartTooltipProps {
  /** Whether tooltip is active/visible */
  active?: boolean;
  /** Tooltip payload from Recharts */
  payload?: Array<{
    name: string;
    value: number;
    color?: string;
    dataKey?: string;
  }>;
  /** Label (usually x-axis value) */
  label?: string;
  /** Currency for formatting */
  currency?: string;
  /** Custom value formatter */
  formatValue?: (value: number) => string;
  /** Custom label formatter */
  formatLabel?: (label: string) => string;
  /** Additional className */
  className?: string;
}

/**
 * Format currency value
 */
function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * ChartTooltip - Clean, minimal tooltip for Recharts
 *
 * Usage:
 * ```tsx
 * <Tooltip
 *   content={<ChartTooltip currency="EUR" />}
 *   contentStyle={{ backgroundColor: 'transparent', border: 'none', padding: 0 }}
 * />
 * ```
 */
export function ChartTooltip({
  active,
  payload,
  label,
  currency = 'USD',
  formatValue,
  formatLabel,
  className,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const displayLabel = formatLabel ? formatLabel(label || '') : label;
  const formatter = formatValue || ((value: number) => formatCurrency(value, currency));

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-popover px-3 py-2.5 shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-100',
        className
      )}
    >
      {displayLabel && (
        <p className="mb-2 text-xs font-medium text-muted-foreground">{displayLabel}</p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-foreground">{entry.name}</span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatter(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tooltip content style for Recharts - makes container transparent
 * so our custom component controls all styling
 */
export const chartTooltipContentStyle = {
  backgroundColor: 'transparent',
  border: 'none',
  padding: 0,
  boxShadow: 'none',
} as const;
