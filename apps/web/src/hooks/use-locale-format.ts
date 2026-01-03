'use client';

import { useLocale } from 'next-intl';
import { useCallback, useMemo } from 'react';

import { useCalendarSystem } from '@/lib/calendar-context';
import { intlLocaleMap, type Locale } from '@/lib/i18n';
import {
  formatJalaliDate,
  formatJalaliWithWeekday,
  formatJalaliRelativeTime,
  formatJalaliTime,
  formatJalaliDateTime,
} from '@/lib/jalali';

/**
 * Centralized locale-aware formatting hook
 *
 * Uses the correct Intl locale for each app locale to ensure:
 * - Persian (fa) uses Persian numerals: ۰۱۲۳۴۵۶۷۸۹
 * - Arabic (ar) uses Arabic-Indic numerals
 * - English (en) and Estonian (et) use Western numerals
 *
 * Supports both Gregorian and Jalali (Persian) calendar systems.
 *
 * Best Practice: All number and date formatting should use this hook
 * to ensure consistent locale-aware formatting across the entire app.
 */
export function useLocaleFormat() {
  const locale = useLocale() as Locale;
  const intlLocale = useMemo(() => intlLocaleMap[locale] || 'en-US', [locale]);
  const calendarSystem = useCalendarSystem();

  /**
   * Format a number with locale-specific numerals
   */
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => {
      return new Intl.NumberFormat(intlLocale, options).format(value);
    },
    [intlLocale]
  );

  /**
   * Format currency with locale-specific numerals and symbols
   */
  const formatCurrency = useCallback(
    (amount: number, currency: string, options?: Partial<Intl.NumberFormatOptions>) => {
      return new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        ...options,
      }).format(amount);
    },
    [intlLocale]
  );

  /**
   * Format currency with decimal precision
   */
  const formatCurrencyPrecise = useCallback(
    (amount: number, currency: string) => {
      return new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    },
    [intlLocale]
  );

  /**
   * Format a percentage with locale-specific numerals
   */
  const formatPercent = useCallback(
    (value: number, options?: Partial<Intl.NumberFormatOptions>) => {
      return new Intl.NumberFormat(intlLocale, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
        ...options,
      }).format(value / 100);
    },
    [intlLocale]
  );

  /**
   * Format a compact number (e.g., 1.2K, 3.5M)
   */
  const formatCompact = useCallback(
    (value: number) => {
      return new Intl.NumberFormat(intlLocale, {
        notation: 'compact',
        compactDisplay: 'short',
      }).format(value);
    },
    [intlLocale]
  );

  /**
   * Format a date with locale-specific formatting
   * Uses Jalali calendar when calendar system is set to 'jalali'
   */
  const formatDate = useCallback(
    (date: Date | string, options?: Intl.DateTimeFormatOptions) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliDate(dateObj, 'full');
      }

      return new Intl.DateTimeFormat(intlLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...options,
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format a date with weekday
   */
  const formatDateWithWeekday = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliWithWeekday(dateObj);
      }

      return new Intl.DateTimeFormat(intlLocale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format a short date (for charts, tables)
   */
  const formatShortDate = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliDate(dateObj, 'short');
      }

      return new Intl.DateTimeFormat(intlLocale, {
        month: 'short',
        day: 'numeric',
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format month and year (for charts)
   */
  const formatMonthYear = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliDate(dateObj, 'monthYear');
      }

      return new Intl.DateTimeFormat(intlLocale, {
        month: 'short',
        year: '2-digit',
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format short month (for chart axis labels, e.g., "Jan 25")
   */
  const formatShortMonth = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliDate(dateObj, 'monthYear');
      }

      return new Intl.DateTimeFormat(intlLocale, {
        month: 'short',
        year: '2-digit',
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format relative time (e.g., "2 days ago", "yesterday")
   */
  const formatRelativeTime = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliRelativeTime(dateObj);
      }

      const now = new Date();
      const diffMs = now.getTime() - dateObj.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });

      if (diffDays === 0) {
        return rtf.format(0, 'day'); // "today"
      } else if (diffDays === 1) {
        return rtf.format(-1, 'day'); // "yesterday"
      } else if (diffDays < 7) {
        return rtf.format(-diffDays, 'day');
      } else if (diffDays < 30) {
        return rtf.format(-Math.floor(diffDays / 7), 'week');
      } else {
        return rtf.format(-Math.floor(diffDays / 30), 'month');
      }
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format time only
   */
  const formatTime = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliTime(dateObj);
      }

      return new Intl.DateTimeFormat(intlLocale, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format date and time together
   */
  const formatDateTime = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliDateTime(dateObj);
      }

      return new Intl.DateTimeFormat(intlLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  /**
   * Format a date in numeric format (YYYY/MM/DD or Persian equivalent)
   */
  const formatDateNumeric = useCallback(
    (date: Date | string) => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      if (calendarSystem === 'jalali') {
        return formatJalaliDate(dateObj, 'numeric');
      }

      return new Intl.DateTimeFormat(intlLocale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(dateObj);
    },
    [intlLocale, calendarSystem]
  );

  return {
    locale,
    intlLocale,
    calendarSystem,
    formatNumber,
    formatCurrency,
    formatCurrencyPrecise,
    formatPercent,
    formatCompact,
    formatDate,
    formatDateWithWeekday,
    formatShortDate,
    formatMonthYear,
    formatShortMonth,
    formatRelativeTime,
    formatTime,
    formatDateTime,
    formatDateNumeric,
  };
}
