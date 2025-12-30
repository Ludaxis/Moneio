'use client';

import { cn } from '@moneio/ui';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export interface DateRange {
  startDate: string;
  endDate: string;
  label: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

type PresetKey = '7d' | '30d' | '3m' | '6m' | '1y';

const presets: Record<
  PresetKey,
  { label: string; getDates: () => { startDate: string; endDate: string } }
> = {
  '7d': {
    label: 'Last 7 days',
    getDates: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    },
  },
  '30d': {
    label: 'Last 30 days',
    getDates: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    },
  },
  '3m': {
    label: 'Last 3 months',
    getDates: () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    },
  },
  '6m': {
    label: 'Last 6 months',
    getDates: () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    },
  },
  '1y': {
    label: 'Last 12 months',
    getDates: () => {
      const end = new Date();
      const start = new Date();
      start.setFullYear(start.getFullYear() - 1);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    },
  },
};

export function getDefaultDateRange(): DateRange {
  const dates = presets['6m'].getDates();
  return { ...dates, label: presets['6m'].label };
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (key: PresetKey) => {
    const preset = presets[key];
    const dates = preset.getDates();
    onChange({ ...dates, label: preset.label });
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm',
          'hover:bg-muted transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/20'
        )}
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground">{value.label}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-border bg-popover shadow-lg">
          <div className="p-1">
            {(Object.keys(presets) as PresetKey[]).map((key) => {
              const preset = presets[key];
              const isSelected = value.label === preset.label;
              return (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm',
                    'hover:bg-muted transition-colors',
                    isSelected && 'bg-muted'
                  )}
                >
                  <span
                    className={cn(isSelected ? 'font-medium text-foreground' : 'text-foreground')}
                  >
                    {preset.label}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
