// Money utilities - pure functions, no external dependencies

import type { CurrencyCode, CurrencyInfo, FxRate, Money } from '../types/money.js';
import { CURRENCIES } from '../types/money.js';

/**
 * Create a Money object from a decimal amount
 */
export function createMoney(decimalAmount: number, currency: CurrencyCode): Money {
  const currencyInfo = getCurrencyInfo(currency);
  const multiplier = Math.pow(10, currencyInfo.decimalPlaces);
  return {
    amount: Math.round(decimalAmount * multiplier),
    currency,
    decimalPlaces: currencyInfo.decimalPlaces,
  };
}

/**
 * Convert Money to decimal amount
 */
export function toDecimal(money: Money): number {
  return money.amount / Math.pow(10, money.decimalPlaces);
}

/**
 * Get currency info
 */
export function getCurrencyInfo(code: CurrencyCode): CurrencyInfo {
  return CURRENCIES[code];
}

/**
 * Format money for display
 */
export function formatMoney(money: Money, locale = 'en-US'): string {
  const decimal = toDecimal(money);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: money.decimalPlaces,
    maximumFractionDigits: money.decimalPlaces,
  }).format(decimal);
}

/**
 * Add two Money values (must be same currency)
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add different currencies: ${a.currency} and ${b.currency}`);
  }
  return {
    amount: a.amount + b.amount,
    currency: a.currency,
    decimalPlaces: a.decimalPlaces,
  };
}

/**
 * Subtract Money values (must be same currency)
 */
export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot subtract different currencies: ${a.currency} and ${b.currency}`);
  }
  return {
    amount: a.amount - b.amount,
    currency: a.currency,
    decimalPlaces: a.decimalPlaces,
  };
}

/**
 * Multiply Money by a scalar
 */
export function multiplyMoney(money: Money, scalar: number): Money {
  return {
    amount: Math.round(money.amount * scalar),
    currency: money.currency,
    decimalPlaces: money.decimalPlaces,
  };
}

/**
 * Convert money using FX rate
 */
export function convertMoney(money: Money, rate: FxRate): Money {
  if (money.currency !== rate.baseCurrency) {
    throw new Error(`Money currency ${money.currency} doesn't match rate base ${rate.baseCurrency}`);
  }

  const targetCurrencyInfo = getCurrencyInfo(rate.quoteCurrency);
  const decimalAmount = toDecimal(money) * rate.rate;
  const multiplier = Math.pow(10, targetCurrencyInfo.decimalPlaces);

  return {
    amount: Math.round(decimalAmount * multiplier),
    currency: rate.quoteCurrency,
    decimalPlaces: targetCurrencyInfo.decimalPlaces,
  };
}

/**
 * Check if Money is zero
 */
export function isZero(money: Money): boolean {
  return money.amount === 0;
}

/**
 * Check if Money is negative
 */
export function isNegative(money: Money): boolean {
  return money.amount < 0;
}

/**
 * Check if Money is positive
 */
export function isPositive(money: Money): boolean {
  return money.amount > 0;
}

/**
 * Get absolute value of Money
 */
export function absMoney(money: Money): Money {
  return {
    ...money,
    amount: Math.abs(money.amount),
  };
}

/**
 * Negate Money
 */
export function negateMoney(money: Money): Money {
  return {
    ...money,
    amount: -money.amount,
  };
}

/**
 * Compare two Money values
 * Returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot compare different currencies: ${a.currency} and ${b.currency}`);
  }
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

/**
 * Sum an array of Money values
 */
export function sumMoney(amounts: Money[]): Money {
  if (amounts.length === 0) {
    throw new Error('Cannot sum empty array');
  }
  return amounts.reduce((acc, curr) => addMoney(acc, curr));
}

/**
 * Calculate percentage of Money
 */
export function percentageMoney(money: Money, percentage: number): Money {
  return {
    amount: Math.round(money.amount * (percentage / 100)),
    currency: money.currency,
    decimalPlaces: money.decimalPlaces,
  };
}

/**
 * Allocate money across n parts (handles rounding)
 */
export function allocateMoney(money: Money, parts: number): Money[] {
  if (parts <= 0) {
    throw new Error('Parts must be positive');
  }

  const baseAmount = Math.floor(money.amount / parts);
  const remainder = money.amount - baseAmount * parts;

  const result: Money[] = [];
  for (let i = 0; i < parts; i++) {
    result.push({
      amount: baseAmount + (i < remainder ? 1 : 0),
      currency: money.currency,
      decimalPlaces: money.decimalPlaces,
    });
  }

  return result;
}
