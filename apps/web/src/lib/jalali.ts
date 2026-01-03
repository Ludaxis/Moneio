/**
 * Jalali (Persian/Shamsi) Calendar Utilities
 *
 * Provides functions for converting between Gregorian and Jalali calendars,
 * and formatting dates in Persian format with Persian numerals.
 */

import jalaali from 'jalaali-js';

// Persian month names
export const jalaliMonths = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

// Short Persian month names
export const jalaliMonthsShort = [
  'فرو',
  'ارد',
  'خرد',
  'تیر',
  'مرد',
  'شهر',
  'مهر',
  'آبا',
  'آذر',
  'دی',
  'بهم',
  'اسف',
] as const;

// Persian weekday names (starting from Saturday)
export const jalaliWeekdays = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const;

// Short Persian weekday names
export const jalaliWeekdaysShort = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

// Persian numeral characters
const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/**
 * Convert a number or string to Persian numerals
 */
export function toPersianNumerals(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => persianNumerals[parseInt(digit, 10)]);
}

/**
 * Convert Persian numerals back to Western numerals
 */
export function toWesternNumerals(value: string): string {
  return value.replace(/[۰-۹]/g, (digit) => String(persianNumerals.indexOf(digit)));
}

export interface JalaliDate {
  jy: number; // Jalali year
  jm: number; // Jalali month (1-12)
  jd: number; // Jalali day (1-31)
}

/**
 * Convert a Gregorian date to Jalali
 */
export function toJalali(date: Date): JalaliDate {
  const { jy, jm, jd } = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return { jy, jm, jd };
}

/**
 * Convert a Jalali date to Gregorian
 */
export function toGregorian(jy: number, jm: number, jd: number): Date {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

/**
 * Get the number of days in a Jalali month
 */
export function getJalaliMonthDays(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

/**
 * Check if a Jalali year is a leap year
 */
export function isJalaliLeapYear(jy: number): boolean {
  return jalaali.isLeapJalaaliYear(jy);
}

/**
 * Get the day of week for a Jalali date (0 = Saturday, 6 = Friday)
 * In Persian calendar, weeks start on Saturday
 */
export function getJalaliDayOfWeek(date: Date): number {
  // JavaScript: 0 = Sunday, 6 = Saturday
  // Persian: 0 = Saturday, 6 = Friday
  const jsDay = date.getDay();
  return (jsDay + 1) % 7;
}

/**
 * Format a date in Jalali format
 */
export function formatJalaliDate(
  date: Date | string,
  format: 'full' | 'short' | 'numeric' | 'monthYear' = 'full'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const { jy, jm, jd } = toJalali(dateObj);

  switch (format) {
    case 'full':
      // "۱۴ دی ۱۴۰۳"
      return `${toPersianNumerals(jd)} ${jalaliMonths[jm - 1]} ${toPersianNumerals(jy)}`;
    case 'short':
      // "۱۴ دی"
      return `${toPersianNumerals(jd)} ${jalaliMonthsShort[jm - 1]}`;
    case 'numeric':
      // "۱۴۰۳/۱۰/۱۴"
      return toPersianNumerals(
        `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
      );
    case 'monthYear':
      // "دی ۱۴۰۳"
      return `${jalaliMonths[jm - 1]} ${toPersianNumerals(jy)}`;
    default:
      return `${toPersianNumerals(jd)} ${jalaliMonths[jm - 1]} ${toPersianNumerals(jy)}`;
  }
}

/**
 * Format a date in Jalali format with weekday
 */
export function formatJalaliWithWeekday(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const { jy, jm, jd } = toJalali(dateObj);
  const dayOfWeek = getJalaliDayOfWeek(dateObj);

  return `${jalaliWeekdays[dayOfWeek]}، ${toPersianNumerals(jd)} ${jalaliMonths[jm - 1]} ${toPersianNumerals(jy)}`;
}

/**
 * Format time in Persian numerals
 */
export function formatJalaliTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return toPersianNumerals(`${hours}:${minutes}`);
}

/**
 * Format date and time in Jalali format
 */
export function formatJalaliDateTime(date: Date | string): string {
  return `${formatJalaliDate(date, 'full')} ${formatJalaliTime(date)}`;
}

/**
 * Format relative time in Persian
 */
export function formatJalaliRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'امروز';
  } else if (diffDays === 1) {
    return 'دیروز';
  } else if (diffDays < 7) {
    return `${toPersianNumerals(diffDays)} روز پیش`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${toPersianNumerals(weeks)} هفته پیش`;
  } else {
    const months = Math.floor(diffDays / 30);
    return `${toPersianNumerals(months)} ماه پیش`;
  }
}

/**
 * Get today's date in Jalali
 */
export function getJalaliToday(): JalaliDate {
  return toJalali(new Date());
}

/**
 * Create a Date object from Jalali date parts
 */
export function createDateFromJalali(jy: number, jm: number, jd: number): Date {
  return toGregorian(jy, jm, jd);
}

/**
 * Get the first day of a Jalali month as a Gregorian Date
 */
export function getJalaliMonthStart(jy: number, jm: number): Date {
  return toGregorian(jy, jm, 1);
}

/**
 * Get the last day of a Jalali month as a Gregorian Date
 */
export function getJalaliMonthEnd(jy: number, jm: number): Date {
  const days = getJalaliMonthDays(jy, jm);
  return toGregorian(jy, jm, days);
}

/**
 * Parse a Jalali date string (YYYY/MM/DD format) to Gregorian Date
 */
export function parseJalaliDate(jalaliStr: string): Date | null {
  // Convert Persian numerals to Western if present
  const westernStr = toWesternNumerals(jalaliStr);
  const match = westernStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);

  if (!match) return null;

  const jy = parseInt(match[1], 10);
  const jm = parseInt(match[2], 10);
  const jd = parseInt(match[3], 10);

  // Validate ranges
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;

  try {
    return toGregorian(jy, jm, jd);
  } catch {
    return null;
  }
}

/**
 * Check if a Jalali date is valid
 */
export function isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
  if (jm < 1 || jm > 12) return false;
  const maxDays = getJalaliMonthDays(jy, jm);
  return jd >= 1 && jd <= maxDays;
}

/**
 * Format a month label for charts (e.g., "مهر ۰۴" for short Jalali format)
 * Used for chart X-axis labels
 */
export function formatJalaliMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  const { jy, jm } = toJalali(date);
  // Format as "مهر ۰۴" (short month + 2-digit year)
  const shortYear = String(jy).slice(-2);
  return `${jalaliMonthsShort[jm - 1]} ${toPersianNumerals(shortYear)}`;
}
