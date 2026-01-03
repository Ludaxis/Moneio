/**
 * Money Transformation Utilities for API Responses
 *
 * The Money type from @moneio/core-ledger stores amounts in minor units (cents).
 * These utilities convert to/from decimal format for API responses.
 *
 * IMPORTANT: Always use these utilities when transforming Money objects for JSON responses.
 * Failing to convert from minor units will result in amounts displayed 100x too high.
 */

export interface MoneyInput {
  amount: number;
  currency: string;
  decimalPlaces?: number;
}

export interface MoneyOutput {
  amount: number;
  currency: string;
  formatted: string;
}

/**
 * Format a decimal amount as currency string
 */
export function formatCurrency(decimalAmount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(decimalAmount);
}

/**
 * Transform Money (in minor units) to API response format (decimal)
 *
 * @example
 * // Input: { amount: 10050, currency: 'EUR', decimalPlaces: 2 }
 * // Output: { amount: 100.50, currency: 'EUR', formatted: '€100.50' }
 */
export function transformMoney(money: MoneyInput): MoneyOutput {
  const decimalPlaces = money.decimalPlaces ?? 2;
  const divisor = Math.pow(10, decimalPlaces);
  const decimalAmount = money.amount / divisor;

  return {
    amount: decimalAmount,
    currency: money.currency,
    formatted: formatCurrency(decimalAmount, money.currency),
  };
}

/**
 * Transform optional Money to API response format
 * Returns undefined if input is undefined
 */
export function transformMoneyOptional(money: MoneyInput | undefined): MoneyOutput | undefined {
  if (!money) return undefined;
  return transformMoney(money);
}

/**
 * Create a zero Money output for a given currency
 */
export function zeroMoney(currency: string): MoneyOutput {
  return {
    amount: 0,
    currency,
    formatted: formatCurrency(0, currency),
  };
}
