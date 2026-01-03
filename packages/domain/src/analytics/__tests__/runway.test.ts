/**
 * Cash Runway Calculator Tests
 *
 * Tests for runway calculation following accounting best practices:
 * - Decimal precision (avoid floating point errors)
 * - Edge cases (zero, negative, empty data)
 * - Boundary conditions (status thresholds)
 * - Sign conventions (burn rate positive = spending more than earning)
 */

import { describe, it, expect } from 'vitest';

import {
  calculateRunway,
  calculateRunwayFromTransactions,
  getRunwayStatus,
  getRunwayDescription,
} from '../runway';
import type { RunwayCalculationInput } from '../types';

describe('Cash Runway Calculator', () => {
  // ============================================
  // Core Calculation Tests
  // ============================================

  describe('calculateRunway', () => {
    it('calculates runway correctly with typical data', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 30000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 8000, netCashflow: -3000 },
          { month: '2024-02', income: 6000, expenses: 9000, netCashflow: -3000 },
          { month: '2024-03', income: 4000, expenses: 7000, netCashflow: -3000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      // Average burn rate: (8000+9000+7000)/3 - (5000+6000+4000)/3 = 8000 - 5000 = 3000
      expect(result.monthlyBurnRate).toBe(3000);
      expect(result.avgMonthlyExpenses).toBe(8000);
      expect(result.avgMonthlyIncome).toBe(5000);
      // Runway: 30000 / 3000 = 10 months
      expect(result.monthsRemaining).toBe(10);
      expect(result.status).toBe('healthy');
      expect(result.currency).toBe('USD');
      expect(result.currentCash).toBe(30000);
    });

    it('returns infinite runway when profitable (income > expenses)', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 10000,
        monthlySummaries: [
          { month: '2024-01', income: 10000, expenses: 7000, netCashflow: 3000 },
          { month: '2024-02', income: 12000, expenses: 8000, netCashflow: 4000 },
          { month: '2024-03', income: 11000, expenses: 6000, netCashflow: 5000 },
        ],
        currency: 'EUR',
      };

      const result = calculateRunway(input);

      expect(result.monthsRemaining).toBe(Infinity);
      expect(result.monthlyBurnRate).toBeLessThanOrEqual(0);
      expect(result.status).toBe('excellent');
      expect(result.projectedZeroDate).toBeNull();
    });

    it('returns zero runway when balance is depleted', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 0,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 8000, netCashflow: -3000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.monthsRemaining).toBe(0);
      expect(result.status).toBe('critical');
      expect(result.projectedZeroDate).not.toBeNull();
    });

    it('returns zero runway when balance is negative', () => {
      const input: RunwayCalculationInput = {
        currentBalance: -5000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 8000, netCashflow: -3000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.monthsRemaining).toBe(0);
      expect(result.status).toBe('critical');
    });

    it('handles empty monthly summaries', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 50000,
        monthlySummaries: [],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.monthsRemaining).toBe(Infinity);
      expect(result.monthlyBurnRate).toBe(0);
      expect(result.avgMonthlyExpenses).toBe(0);
      expect(result.avgMonthlyIncome).toBe(0);
      expect(result.status).toBe('excellent');
    });

    it('handles empty summaries with zero balance', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 0,
        monthlySummaries: [],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.monthsRemaining).toBe(0);
      expect(result.status).toBe('critical');
    });

    it('uses only last 3 months for calculations when more data available', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 12000,
        monthlySummaries: [
          { month: '2024-01', income: 1000, expenses: 10000, netCashflow: -9000 }, // Should be ignored
          { month: '2024-02', income: 1000, expenses: 10000, netCashflow: -9000 }, // Should be ignored
          { month: '2024-03', income: 5000, expenses: 7000, netCashflow: -2000 },
          { month: '2024-04', income: 6000, expenses: 8000, netCashflow: -2000 },
          { month: '2024-05', income: 4000, expenses: 6000, netCashflow: -2000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      // Should use last 3 months: avg expenses = 7000, avg income = 5000, burn = 2000
      expect(result.monthlyBurnRate).toBe(2000);
      expect(result.monthsRemaining).toBe(6);
    });
  });

  // ============================================
  // Decimal Precision Tests
  // ============================================

  describe('decimal precision', () => {
    it('rounds monetary values to 2 decimal places', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 10000.456,
        monthlySummaries: [
          { month: '2024-01', income: 3333.333, expenses: 5555.555, netCashflow: -2222.222 },
          { month: '2024-02', income: 3333.333, expenses: 5555.555, netCashflow: -2222.222 },
          { month: '2024-03', income: 3333.334, expenses: 5555.556, netCashflow: -2222.222 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      // Check all monetary values are rounded to 2 decimals
      expect(result.currentCash).toBe(10000.46);
      // Use toBeCloseTo to handle floating point precision
      expect(result.avgMonthlyExpenses).toBeCloseTo(5555.56, 2);
      expect(result.avgMonthlyIncome).toBeCloseTo(3333.33, 2);
      expect(result.monthlyBurnRate).toBeCloseTo(2222.22, 2);
    });

    it('rounds months remaining to 1 decimal place', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 10000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 8000, netCashflow: -3000 },
          { month: '2024-02', income: 5000, expenses: 8000, netCashflow: -3000 },
          { month: '2024-03', income: 5000, expenses: 8000, netCashflow: -3000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      // 10000 / 3000 = 3.333... should round to 3.3
      expect(result.monthsRemaining).toBe(3.3);
    });

    it('handles very small amounts without floating point errors', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 0.01,
        monthlySummaries: [
          // Use values that are significant after 2-decimal rounding
          { month: '2024-01', income: 0.01, expenses: 0.03, netCashflow: -0.02 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.currentCash).toBe(0.01);
      expect(result.monthlyBurnRate).toBe(0.02);
      expect(result.monthsRemaining).toBe(0.5);
    });
  });

  // ============================================
  // Status Threshold Tests
  // ============================================

  describe('getRunwayStatus', () => {
    it('returns critical for < 3 months', () => {
      expect(getRunwayStatus(0)).toBe('critical');
      expect(getRunwayStatus(1)).toBe('critical');
      expect(getRunwayStatus(2)).toBe('critical');
      expect(getRunwayStatus(2.9)).toBe('critical');
    });

    it('returns warning for 3-6 months', () => {
      expect(getRunwayStatus(3)).toBe('warning');
      expect(getRunwayStatus(4)).toBe('warning');
      expect(getRunwayStatus(5)).toBe('warning');
      expect(getRunwayStatus(5.9)).toBe('warning');
    });

    it('returns healthy for 6-12 months', () => {
      expect(getRunwayStatus(6)).toBe('healthy');
      expect(getRunwayStatus(8)).toBe('healthy');
      expect(getRunwayStatus(10)).toBe('healthy');
      expect(getRunwayStatus(11.9)).toBe('healthy');
    });

    it('returns excellent for >12 months', () => {
      // Note: exactly 12 is 'healthy', only >12 is 'excellent'
      expect(getRunwayStatus(12.1)).toBe('excellent');
      expect(getRunwayStatus(24)).toBe('excellent');
      expect(getRunwayStatus(100)).toBe('excellent');
    });

    it('returns excellent for infinite runway', () => {
      expect(getRunwayStatus(Infinity)).toBe('excellent');
    });

    it('handles exact boundary values correctly', () => {
      // Boundary at 3 months
      expect(getRunwayStatus(2.99)).toBe('critical');
      expect(getRunwayStatus(3.0)).toBe('warning');

      // Boundary at 6 months
      expect(getRunwayStatus(5.99)).toBe('warning');
      expect(getRunwayStatus(6.0)).toBe('healthy');

      // Boundary at 12 months (exactly 12 is healthy, only >12 is excellent)
      expect(getRunwayStatus(11.99)).toBe('healthy');
      expect(getRunwayStatus(12.0)).toBe('healthy');
      expect(getRunwayStatus(12.01)).toBe('excellent');
    });
  });

  // ============================================
  // Description Generation Tests
  // ============================================

  describe('getRunwayDescription', () => {
    it('generates description for profitable business', () => {
      const metrics = {
        monthsRemaining: Infinity,
        currentCash: 50000,
        monthlyBurnRate: -2000,
        avgMonthlyExpenses: 5000,
        avgMonthlyIncome: 7000,
        status: 'excellent' as const,
        currency: 'USD',
        calculatedAt: new Date(),
        projectedZeroDate: null,
      };

      const description = getRunwayDescription(metrics);
      expect(description).toContain('profitable');
      expect(description).toContain('unlimited runway');
    });

    it('generates description for depleted cash', () => {
      const metrics = {
        monthsRemaining: 0,
        currentCash: 0,
        monthlyBurnRate: 3000,
        avgMonthlyExpenses: 8000,
        avgMonthlyIncome: 5000,
        status: 'critical' as const,
        currency: 'USD',
        calculatedAt: new Date(),
        projectedZeroDate: new Date(),
      };

      const description = getRunwayDescription(metrics);
      expect(description).toContain('Critical');
      expect(description).toContain('depleted');
    });

    it('generates description for critical runway', () => {
      const metrics = {
        monthsRemaining: 2,
        currentCash: 6000,
        monthlyBurnRate: 3000,
        avgMonthlyExpenses: 8000,
        avgMonthlyIncome: 5000,
        status: 'critical' as const,
        currency: 'USD',
        calculatedAt: new Date(),
        projectedZeroDate: new Date(),
      };

      const description = getRunwayDescription(metrics);
      expect(description).toContain('Critical');
      expect(description).toContain('2 months');
    });

    it('uses correct singular/plural for months', () => {
      const baseMetrics = {
        currentCash: 3000,
        monthlyBurnRate: 3000,
        avgMonthlyExpenses: 8000,
        avgMonthlyIncome: 5000,
        status: 'critical' as const,
        currency: 'USD',
        calculatedAt: new Date(),
        projectedZeroDate: new Date(),
      };

      const oneMonth = getRunwayDescription({ ...baseMetrics, monthsRemaining: 1 });
      expect(oneMonth).toContain('1 month');
      expect(oneMonth).not.toContain('months');

      const twoMonths = getRunwayDescription({ ...baseMetrics, monthsRemaining: 2 });
      expect(twoMonths).toContain('2 months');
    });
  });

  // ============================================
  // Transaction-based Calculation Tests
  // ============================================

  describe('calculateRunwayFromTransactions', () => {
    it('groups transactions by month correctly', () => {
      const transactions = [
        { postedAt: new Date('2024-01-15'), amount: 5000 },
        { postedAt: new Date('2024-01-20'), amount: -3000 },
        { postedAt: new Date('2024-01-25'), amount: -2000 },
        { postedAt: new Date('2024-02-10'), amount: 6000 },
        { postedAt: new Date('2024-02-15'), amount: -4000 },
        { postedAt: new Date('2024-03-05'), amount: 4000 },
        { postedAt: new Date('2024-03-20'), amount: -5000 },
      ];

      const result = calculateRunwayFromTransactions(15000, transactions, 'USD');

      // Jan: income=5000, expenses=5000
      // Feb: income=6000, expenses=4000
      // Mar: income=4000, expenses=5000
      // Avg income: 5000, Avg expenses: 4666.67, Burn rate = -333.33 (profitable!)
      expect(result.avgMonthlyIncome).toBe(5000);
      expect(result.avgMonthlyExpenses).toBeCloseTo(4666.67, 1);
    });

    it('treats positive amounts as income, negative as expenses', () => {
      const transactions = [
        { postedAt: new Date('2024-01-15'), amount: 10000 }, // Income
        { postedAt: new Date('2024-01-20'), amount: -7000 }, // Expense
      ];

      const result = calculateRunwayFromTransactions(30000, transactions, 'USD');

      expect(result.avgMonthlyIncome).toBe(10000);
      expect(result.avgMonthlyExpenses).toBe(7000);
    });

    it('respects lookbackMonths parameter', () => {
      const transactions = [
        { postedAt: new Date('2024-01-15'), amount: -10000 }, // Old, high expense
        { postedAt: new Date('2024-02-15'), amount: -10000 }, // Old, high expense
        { postedAt: new Date('2024-03-15'), amount: -1000 }, // Recent, low expense
        { postedAt: new Date('2024-04-15'), amount: -1000 }, // Recent, low expense
      ];

      // With lookback of 2 months, should only use March and April
      const result = calculateRunwayFromTransactions(10000, transactions, 'USD', 2);

      expect(result.avgMonthlyExpenses).toBe(1000);
    });

    it('handles empty transactions array', () => {
      const result = calculateRunwayFromTransactions(50000, [], 'USD');

      expect(result.monthsRemaining).toBe(Infinity);
      expect(result.monthlyBurnRate).toBe(0);
      expect(result.status).toBe('excellent');
    });

    it('handles transactions in same month', () => {
      const transactions = [
        { postedAt: new Date('2024-03-01'), amount: 1000 },
        { postedAt: new Date('2024-03-15'), amount: 2000 },
        { postedAt: new Date('2024-03-31'), amount: -1500 },
      ];

      const result = calculateRunwayFromTransactions(10000, transactions, 'USD');

      expect(result.avgMonthlyIncome).toBe(3000);
      expect(result.avgMonthlyExpenses).toBe(1500);
    });
  });

  // ============================================
  // Edge Cases and Error Handling
  // ============================================

  describe('edge cases', () => {
    it('handles break-even scenario (income equals expenses)', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 10000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 5000, netCashflow: 0 },
          { month: '2024-02', income: 5000, expenses: 5000, netCashflow: 0 },
          { month: '2024-03', income: 5000, expenses: 5000, netCashflow: 0 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.monthlyBurnRate).toBe(0);
      expect(result.monthsRemaining).toBe(Infinity);
      expect(result.status).toBe('excellent');
    });

    it('handles single month of data', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 6000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 8000, netCashflow: -3000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.monthlyBurnRate).toBe(3000);
      expect(result.monthsRemaining).toBe(2);
      expect(result.status).toBe('critical');
    });

    it('handles very large numbers', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 1000000000, // 1 billion
        monthlySummaries: [
          { month: '2024-01', income: 50000000, expenses: 100000000, netCashflow: -50000000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      expect(result.monthsRemaining).toBe(20);
      expect(result.status).toBe('excellent');
    });

    it('calculates projected zero date correctly', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 30000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 10000, netCashflow: -5000 },
          { month: '2024-02', income: 5000, expenses: 10000, netCashflow: -5000 },
          { month: '2024-03', income: 5000, expenses: 10000, netCashflow: -5000 },
        ],
        currency: 'USD',
      };

      const result = calculateRunway(input);

      // 30000 / 5000 = 6 months
      expect(result.monthsRemaining).toBe(6);
      expect(result.projectedZeroDate).not.toBeNull();
      expect(result.projectedZeroDate).toBeInstanceOf(Date);
    });
  });

  // ============================================
  // Accounting-Specific Tests
  // ============================================

  describe('accounting conventions', () => {
    it('calculates burn rate as expenses minus income (positive = losing money)', () => {
      const losingMoney: RunwayCalculationInput = {
        currentBalance: 10000,
        monthlySummaries: [
          { month: '2024-01', income: 3000, expenses: 5000, netCashflow: -2000 },
        ],
        currency: 'USD',
      };

      const makingMoney: RunwayCalculationInput = {
        currentBalance: 10000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 3000, netCashflow: 2000 },
        ],
        currency: 'USD',
      };

      const losingResult = calculateRunway(losingMoney);
      const makingResult = calculateRunway(makingMoney);

      expect(losingResult.monthlyBurnRate).toBe(2000); // Positive = losing
      expect(makingResult.monthlyBurnRate).toBe(-2000); // Negative = gaining
    });

    it('includes calculated timestamp', () => {
      const input: RunwayCalculationInput = {
        currentBalance: 10000,
        monthlySummaries: [
          { month: '2024-01', income: 5000, expenses: 8000, netCashflow: -3000 },
        ],
        currency: 'USD',
      };

      const before = new Date();
      const result = calculateRunway(input);
      const after = new Date();

      expect(result.calculatedAt).toBeInstanceOf(Date);
      expect(result.calculatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.calculatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
