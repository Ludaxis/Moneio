/**
 * Money Transform Utility Tests
 *
 * These tests ensure correct conversion between minor units (cents) and decimal display.
 * This is CRITICAL - incorrect conversion results in amounts displayed 100x wrong.
 */

import { describe, it, expect } from 'vitest';

import {
  formatCurrency,
  transformMoney,
  transformMoneyOptional,
  zeroMoney,
} from '../money-transform';

describe('Money Transform Utilities', () => {
  // ============================================
  // formatCurrency Tests
  // ============================================

  describe('formatCurrency', () => {
    it('formats EUR correctly', () => {
      expect(formatCurrency(100.5, 'EUR')).toBe('€100.50');
    });

    it('formats USD correctly', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
    });

    it('formats zero correctly', () => {
      expect(formatCurrency(0, 'EUR')).toBe('€0.00');
    });

    it('formats large numbers with thousands separator', () => {
      expect(formatCurrency(1234567.89, 'USD')).toBe('$1,234,567.89');
    });

    it('formats negative numbers correctly', () => {
      expect(formatCurrency(-500.25, 'EUR')).toBe('-€500.25');
    });

    it('rounds to 2 decimal places', () => {
      expect(formatCurrency(100.999, 'EUR')).toBe('€101.00');
      expect(formatCurrency(100.001, 'EUR')).toBe('€100.00');
    });
  });

  // ============================================
  // transformMoney Tests - CRITICAL FOR BUG PREVENTION
  // ============================================

  describe('transformMoney', () => {
    it('converts cents to decimal (100 cents = 1.00)', () => {
      const result = transformMoney({ amount: 100, currency: 'EUR', decimalPlaces: 2 });
      expect(result.amount).toBe(1);
    });

    it('converts 10000 cents to 100.00', () => {
      const result = transformMoney({ amount: 10000, currency: 'EUR', decimalPlaces: 2 });
      expect(result.amount).toBe(100);
      expect(result.formatted).toBe('€100.00');
    });

    it('converts 2644633 cents to 26446.33', () => {
      // This is the exact bug case that was caught
      const result = transformMoney({ amount: 2644633, currency: 'EUR', decimalPlaces: 2 });
      expect(result.amount).toBe(26446.33);
      expect(result.formatted).toBe('€26,446.33');
    });

    it('handles zero amount', () => {
      const result = transformMoney({ amount: 0, currency: 'EUR', decimalPlaces: 2 });
      expect(result.amount).toBe(0);
      expect(result.formatted).toBe('€0.00');
    });

    it('handles negative amounts', () => {
      const result = transformMoney({ amount: -5000, currency: 'EUR', decimalPlaces: 2 });
      expect(result.amount).toBe(-50);
      expect(result.formatted).toBe('-€50.00');
    });

    it('defaults to 2 decimal places if not specified', () => {
      const result = transformMoney({ amount: 10000, currency: 'EUR' });
      expect(result.amount).toBe(100);
    });

    it('handles 0 decimal places (whole units)', () => {
      const result = transformMoney({ amount: 100, currency: 'JPY', decimalPlaces: 0 });
      expect(result.amount).toBe(100);
    });

    it('handles 3 decimal places', () => {
      const result = transformMoney({ amount: 1000, currency: 'KWD', decimalPlaces: 3 });
      expect(result.amount).toBe(1);
    });

    it('returns correct currency in output', () => {
      const result = transformMoney({ amount: 100, currency: 'USD', decimalPlaces: 2 });
      expect(result.currency).toBe('USD');
    });

    // Regression test for the actual bug
    it('REGRESSION: transformMoney should NOT return cents as euros', () => {
      // If someone passes { amount: 26446.33 } thinking it's already in euros,
      // the result should be 264.4633 (divided by 100), not 26446.33
      // This catches the bug where amounts were displayed 100x too high
      const input = { amount: 2644633, currency: 'EUR', decimalPlaces: 2 };
      const result = transformMoney(input);

      // Result should be ~26k, not ~2.6M
      expect(result.amount).toBeLessThan(100000);
      expect(result.amount).toBe(26446.33);
    });
  });

  // ============================================
  // transformMoneyOptional Tests
  // ============================================

  describe('transformMoneyOptional', () => {
    it('returns undefined for undefined input', () => {
      expect(transformMoneyOptional(undefined)).toBeUndefined();
    });

    it('transforms valid input', () => {
      const result = transformMoneyOptional({ amount: 10000, currency: 'EUR', decimalPlaces: 2 });
      expect(result?.amount).toBe(100);
    });
  });

  // ============================================
  // zeroMoney Tests
  // ============================================

  describe('zeroMoney', () => {
    it('creates zero EUR', () => {
      const result = zeroMoney('EUR');
      expect(result.amount).toBe(0);
      expect(result.currency).toBe('EUR');
      expect(result.formatted).toBe('€0.00');
    });

    it('creates zero USD', () => {
      const result = zeroMoney('USD');
      expect(result.amount).toBe(0);
      expect(result.currency).toBe('USD');
      expect(result.formatted).toBe('$0.00');
    });
  });

  // ============================================
  // Real-World Scenario Tests
  // ============================================

  describe('real-world scenarios', () => {
    it('transforms P&L revenue correctly', () => {
      // Revenue of €26,446.33 stored as 2644633 cents
      const revenue = transformMoney({ amount: 2644633, currency: 'EUR', decimalPlaces: 2 });
      expect(revenue.formatted).toBe('€26,446.33');
    });

    it('transforms expenses correctly', () => {
      // Expenses of €22,652.70 stored as 2265270 cents
      const expenses = transformMoney({ amount: 2265270, currency: 'EUR', decimalPlaces: 2 });
      expect(expenses.formatted).toBe('€22,652.70');
    });

    it('calculates net income display correctly', () => {
      const revenue = transformMoney({ amount: 2644633, currency: 'EUR', decimalPlaces: 2 });
      const expenses = transformMoney({ amount: 2265270, currency: 'EUR', decimalPlaces: 2 });
      const netIncome = revenue.amount - expenses.amount;

      expect(netIncome).toBeCloseTo(3793.63, 2);
    });

    it('handles typical monthly expense amounts', () => {
      // Rent of €1,500 stored as 150000 cents
      const rent = transformMoney({ amount: 150000, currency: 'EUR', decimalPlaces: 2 });
      expect(rent.formatted).toBe('€1,500.00');
    });

    it('handles small transaction amounts', () => {
      // Coffee €4.50 stored as 450 cents
      const coffee = transformMoney({ amount: 450, currency: 'EUR', decimalPlaces: 2 });
      expect(coffee.formatted).toBe('€4.50');
    });
  });
});
