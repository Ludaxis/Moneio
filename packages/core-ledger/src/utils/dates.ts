// Date utilities - pure functions, no external dependencies

import type { SupportedLocale } from '../types/common.js';

/**
 * Get current ISO timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Parse date string to Date object
 */
export function parseDate(dateString: string): Date {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateString}`);
  }
  return date;
}

/**
 * Format date for display based on locale
 */
export function formatDate(
  date: Date | string,
  locale: SupportedLocale = 'en',
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' ? parseDate(date) : date;

  const localeMap: Record<SupportedLocale, string> = {
    en: 'en-US',
    et: 'et-EE',
    fa: 'fa-IR',
    ar: 'ar-SA',
  };

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  return new Intl.DateTimeFormat(localeMap[locale], options ?? defaultOptions).format(dateObj);
}

/**
 * Format date to ISO date string (YYYY-MM-DD)
 */
export function toIsoDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get start of day
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get start of month
 */
export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of month
 */
export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get start of year
 */
export function startOfYear(date: Date): Date {
  const result = new Date(date);
  result.setMonth(0);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of year
 */
export function endOfYear(date: Date): Date {
  const result = new Date(date);
  result.setMonth(11);
  result.setDate(31);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Add years to a date
 */
export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Get difference in days between two dates
 */
export function diffInDays(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / msPerDay);
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Check if date is in the future
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Check if date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Get fiscal year start date
 */
export function getFiscalYearStart(date: Date, fiscalYearStartMonth: number = 0): Date {
  const year = date.getMonth() >= fiscalYearStartMonth ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(year, fiscalYearStartMonth, 1, 0, 0, 0, 0);
}

/**
 * Get fiscal year end date
 */
export function getFiscalYearEnd(date: Date, fiscalYearStartMonth: number = 0): Date {
  const start = getFiscalYearStart(date, fiscalYearStartMonth);
  const end = addMonths(start, 12);
  return addDays(end, -1);
}

/**
 * Generate date range as array of dates
 */
export function dateRange(start: Date, end: Date): Date[] {
  const result: Date[] = [];
  let current = new Date(start);

  while (current <= end) {
    result.push(new Date(current));
    current = addDays(current, 1);
  }

  return result;
}

/**
 * Generate month range as array of { start, end } objects
 */
export function monthRange(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const result: Array<{ start: Date; end: Date }> = [];
  let current = startOfMonth(start);

  while (current <= end) {
    result.push({
      start: startOfMonth(current),
      end: endOfMonth(current),
    });
    current = addMonths(current, 1);
  }

  return result;
}
