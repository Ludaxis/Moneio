/**
 * Locale-aware formatting utilities
 *
 * Provides functions for formatting numbers, currencies, dates, and percentages
 * with proper locale support including Persian/Arabic numerals.
 * Supports both Gregorian and Jalali (Persian) calendar systems.
 */

import { defaultLocale, intlLocaleMap, type Locale } from '@moneio/i18n';

import {
  formatJalaliDate,
  formatJalaliRelativeTime,
  formatJalaliWithWeekday,
} from './jalali';

export type CalendarSystem = 'gregorian' | 'jalali';

/**
 * Get the Intl locale code from our app locale
 */
export function getIntlLocale(locale: string): string {
  return intlLocaleMap[locale as Locale] || intlLocaleMap[defaultLocale];
}

/**
 * Format a number with locale-specific formatting
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  const intlLocale = getIntlLocale(locale);
  return new Intl.NumberFormat(intlLocale, options).format(value);
}

/**
 * Format currency with locale-specific formatting
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  const intlLocale = getIntlLocale(locale);
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  }).format(amount);
}

/**
 * Format currency with decimal places
 */
export function formatCurrencyWithDecimals(
  amount: number,
  currency: string,
  locale: string
): string {
  const intlLocale = getIntlLocale(locale);
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a percentage with locale-specific formatting
 */
export function formatPercent(
  value: number,
  locale: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  const intlLocale = getIntlLocale(locale);
  return new Intl.NumberFormat(intlLocale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    ...options,
  }).format(value / 100);
}

/**
 * Format a date with locale-specific formatting
 * Supports both Gregorian and Jalali calendar systems
 */
export function formatDate(
  date: Date | string,
  locale: string,
  optionsOrCalendar?: Intl.DateTimeFormatOptions | CalendarSystem,
  calendarSystem: CalendarSystem = 'gregorian'
): string {
  // Handle overload: if third param is a string, it's the calendar system
  let options: Intl.DateTimeFormatOptions | undefined;
  let calendar = calendarSystem;
  if (typeof optionsOrCalendar === 'string') {
    calendar = optionsOrCalendar;
  } else {
    options = optionsOrCalendar;
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Use Jalali formatting if calendar system is jalali
  if (calendar === 'jalali') {
    return formatJalaliDate(dateObj, 'full');
  }

  const intlLocale = getIntlLocale(locale);
  return new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  }).format(dateObj);
}

/**
 * Format a date with weekday
 * Supports both Gregorian and Jalali calendar systems
 */
export function formatDateWithWeekday(
  date: Date | string,
  locale: string,
  calendarSystem: CalendarSystem = 'gregorian'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (calendarSystem === 'jalali') {
    return formatJalaliWithWeekday(dateObj);
  }

  const intlLocale = getIntlLocale(locale);
  return new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format a short date (for charts, tables)
 * Supports both Gregorian and Jalali calendar systems
 */
export function formatShortDate(
  date: Date | string,
  locale: string,
  calendarSystem: CalendarSystem = 'gregorian'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (calendarSystem === 'jalali') {
    return formatJalaliDate(dateObj, 'short');
  }

  const intlLocale = getIntlLocale(locale);
  return new Intl.DateTimeFormat(intlLocale, {
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format month and year (for charts)
 * Supports both Gregorian and Jalali calendar systems
 */
export function formatMonthYear(
  date: Date | string,
  locale: string,
  calendarSystem: CalendarSystem = 'gregorian'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (calendarSystem === 'jalali') {
    return formatJalaliDate(dateObj, 'monthYear');
  }

  const intlLocale = getIntlLocale(locale);
  return new Intl.DateTimeFormat(intlLocale, {
    month: 'short',
    year: '2-digit',
  }).format(dateObj);
}

/**
 * Format relative time (e.g., "2 days ago")
 * Supports both Gregorian and Jalali calendar systems
 */
export function formatRelativeTime(
  date: Date | string,
  locale: string,
  calendarSystem: CalendarSystem = 'gregorian'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // For Jalali, use Persian relative time
  if (calendarSystem === 'jalali') {
    return formatJalaliRelativeTime(dateObj);
  }

  const intlLocale = getIntlLocale(locale);
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });

  if (diffDays === 0) {
    return rtf.format(0, 'day'); // "today"
  } else if (diffDays === 1) {
    return rtf.format(-1, 'day'); // "yesterday"
  } else if (diffDays < 7) {
    return rtf.format(-diffDays, 'day'); // "X days ago"
  } else if (diffDays < 30) {
    return rtf.format(-Math.floor(diffDays / 7), 'week');
  } else {
    return rtf.format(-Math.floor(diffDays / 30), 'month');
  }
}

/**
 * Convert a number to locale-specific digits only (no formatting)
 * Useful when you need just the digits converted
 */
export function toLocaleDigits(value: number | string, locale: string): string {
  const intlLocale = getIntlLocale(locale);
  const numStr = String(value);
  // Use NumberFormat with no grouping to just convert digits
  const parts = new Intl.NumberFormat(intlLocale, {
    useGrouping: false,
  }).formatToParts(parseFloat(numStr.replace(/[^\d.-]/g, '')) || 0);

  return parts.map((p) => p.value).join('');
}
