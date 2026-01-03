'use client';

import { cn } from '@moneio/ui';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useRef, useEffect, useMemo } from 'react';

import { useLocaleFormat } from '@/hooks/use-locale-format';

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

export type PresetKey = '7d' | '30d' | '3m' | '6m' | '1y';

// Date calculation functions (static, no translations needed)
const getPresetDates = (key: PresetKey): { startDate: string; endDate: string } => {
  const end = new Date();
  const start = new Date();

  switch (key) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '3m':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
};

// Translation keys for presets
const presetTranslationKeys: Record<PresetKey, string> = {
  '7d': 'last7Days',
  '30d': 'last30Days',
  '3m': 'last3Months',
  '6m': 'last6Months',
  '1y': 'last12Months',
};

// Calculate min date (1 year ago)
function getMinDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

// Calculate max date (today)
function getMaxDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Note: This returns English label by default - the component will translate it when rendering
export function getDefaultDateRange(): DateRange {
  const dates = getPresetDates('6m');
  return { ...dates, label: 'last6Months' }; // Translation key as label
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const t = useTranslations('dashboard.dateRange');
  const tCommon = useTranslations('common');
  const { formatShortDate } = useLocaleFormat();

  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(value.startDate);
  const [customEnd, setCustomEnd] = useState(value.endDate);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build presets with translated labels
  const presets = useMemo(
    () =>
      (Object.keys(presetTranslationKeys) as PresetKey[]).map((key) => ({
        key,
        label: t(presetTranslationKeys[key]),
        getDates: () => getPresetDates(key),
      })),
    [t]
  );

  // Check if current value is a preset (compare by translation key or translated label)
  const isPreset = presets.some(
    (p) => p.label === value.label || presetTranslationKeys[p.key] === value.label
  );

  // Get the display label for the button
  const displayLabel = useMemo(() => {
    // Check if the label is a translation key
    const translationKey = value.label;
    if (Object.values(presetTranslationKeys).includes(translationKey)) {
      return t(translationKey);
    }
    // Handle 'customRange' and 'Custom' as special cases
    if (translationKey === 'customRange' || translationKey === 'Custom') {
      return t('customRange');
    }
    // Otherwise, it's a custom label (like date range string)
    return value.label;
  }, [value.label, t]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (key: PresetKey) => {
    const dates = getPresetDates(key);
    // Store the translation key as label so it persists correctly
    onChange({ ...dates, label: presetTranslationKeys[key] });
    setShowCustom(false);
    setOpen(false);
  };

  const handleCustomClick = () => {
    setShowCustom(true);
    setCustomStart(value.startDate);
    setCustomEnd(value.endDate);
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      const startLabel = formatShortDate(customStart);
      const endLabel = formatShortDate(customEnd);
      onChange({
        startDate: customStart,
        endDate: customEnd,
        label: `${startLabel} - ${endLabel}`,
      });
      setShowCustom(false);
      setOpen(false);
    }
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
        <span className="font-medium text-foreground">{displayLabel}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-popover shadow-lg">
          {!showCustom ? (
            <div className="p-1">
              {presets.map((preset) => {
                const isSelected =
                  value.label === preset.label || presetTranslationKeys[preset.key] === value.label;
                return (
                  <button
                    key={preset.key}
                    onClick={() => handleSelect(preset.key)}
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
              <div className="my-1 border-t border-border" />
              <button
                onClick={handleCustomClick}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm',
                  'hover:bg-muted transition-colors',
                  !isPreset && 'bg-muted'
                )}
              >
                <span className={cn(!isPreset ? 'font-medium text-foreground' : 'text-foreground')}>
                  {t('customRange')}
                </span>
                {!isPreset && <Check className="h-4 w-4 text-primary" />}
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              <div className="text-sm font-medium text-foreground">{t('customDateRange')}</div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">{t('startDate')}</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    min={getMinDate()}
                    max={customEnd || getMaxDate()}
                    className={cn(
                      'w-full mt-1 px-3 py-2 rounded-md text-sm',
                      'bg-muted border border-border',
                      'focus:outline-none focus:ring-2 focus:ring-primary/20'
                    )}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('endDate')}</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    min={customStart || getMinDate()}
                    max={getMaxDate()}
                    className={cn(
                      'w-full mt-1 px-3 py-2 rounded-md text-sm',
                      'bg-muted border border-border',
                      'focus:outline-none focus:ring-2 focus:ring-primary/20'
                    )}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCustom(false)}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
                >
                  {tCommon('back')}
                </button>
                <button
                  onClick={handleApplyCustom}
                  disabled={!customStart || !customEnd || customStart > customEnd}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-md font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {t('apply')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
