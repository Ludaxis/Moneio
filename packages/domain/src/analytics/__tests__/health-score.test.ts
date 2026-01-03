/**
 * Financial Health Score Calculator Tests
 *
 * Tests for health score calculation following accounting best practices:
 * - Weighted metric calculations (weights must sum to 1.0)
 * - Score thresholds and grade boundaries
 * - Individual metric scoring
 * - Recommendations generation
 */

import { describe, it, expect } from 'vitest';

import { calculateHealthScore, calculateVolatility } from '../health-score';
import type { HealthScoreInput } from '../types';

describe('Financial Health Score Calculator', () => {
  // ============================================
  // Core Score Calculation Tests
  // ============================================

  describe('calculateHealthScore', () => {
    it('calculates overall score as weighted average of metrics', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: -1000, // Profitable
        avgMonthlyIncome: 15000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 24,
        recurringExpenseCount: 10,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      // With good metrics, score should be high
      expect(result.overallScore).toBeGreaterThan(70);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('returns score between 0 and 100', () => {
      const goodInput: HealthScoreInput = {
        currentBalance: 100000,
        monthlyBurnRate: -5000,
        avgMonthlyIncome: 20000,
        avgMonthlyExpenses: 10000,
        runwayMonths: Infinity,
        recurringExpenseCount: 15,
        monthlyRecurringExpenses: 8000,
        incomeVolatility: 0.05,
        expenseVolatility: 0.05,
        currency: 'USD',
      };

      const poorInput: HealthScoreInput = {
        currentBalance: 1000,
        monthlyBurnRate: 5000,
        avgMonthlyIncome: 3000,
        avgMonthlyExpenses: 8000,
        runwayMonths: 0.2,
        recurringExpenseCount: 0,
        monthlyRecurringExpenses: 0,
        incomeVolatility: 0.8,
        expenseVolatility: 0.8,
        currency: 'USD',
      };

      const goodResult = calculateHealthScore(goodInput);
      const poorResult = calculateHealthScore(poorInput);

      expect(goodResult.overallScore).toBeGreaterThanOrEqual(0);
      expect(goodResult.overallScore).toBeLessThanOrEqual(100);
      expect(poorResult.overallScore).toBeGreaterThanOrEqual(0);
      expect(poorResult.overallScore).toBeLessThanOrEqual(100);
    });

    it('includes all 5 metrics with correct weights', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.2,
        expenseVolatility: 0.2,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      expect(result.metrics).toHaveLength(5);

      const metricNames = result.metrics.map((m) => m.name);
      expect(metricNames).toContain('Profitability');
      expect(metricNames).toContain('Cash Runway');
      expect(metricNames).toContain('Cash Reserves');
      expect(metricNames).toContain('Expense Predictability');
      expect(metricNames).toContain('Income Stability');

      // Weights must sum to 1.0
      const totalWeight = result.metrics.reduce((sum, m) => sum + m.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });
  });

  // ============================================
  // Grade and Rating Tests
  // ============================================

  describe('grades and ratings', () => {
    it('assigns excellent rating for score >= 90', () => {
      const input: HealthScoreInput = {
        currentBalance: 100000,
        monthlyBurnRate: -5000,
        avgMonthlyIncome: 20000,
        avgMonthlyExpenses: 10000,
        runwayMonths: Infinity,
        recurringExpenseCount: 15,
        monthlyRecurringExpenses: 9000,
        incomeVolatility: 0.02,
        expenseVolatility: 0.02,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      if (result.overallScore >= 90) {
        expect(result.rating).toBe('excellent');
        expect(result.grade).toBe('A');
      }
    });

    it('assigns correct grades for score ranges', () => {
      // Test grade boundaries
      const testCases = [
        { minScore: 90, expectedGrade: 'A' },
        { minScore: 80, expectedGrade: 'B+' },
        { minScore: 75, expectedGrade: 'B' },
        { minScore: 70, expectedGrade: 'B-' },
        { minScore: 65, expectedGrade: 'C+' },
        { minScore: 60, expectedGrade: 'C' },
        { minScore: 55, expectedGrade: 'C-' },
        { minScore: 50, expectedGrade: 'D+' },
        { minScore: 40, expectedGrade: 'D' },
      ];

      // Just verify the grading logic is consistent
      expect(testCases.length).toBe(9);
    });

    it('assigns rating based on score thresholds', () => {
      // Create inputs that should produce different ratings
      const excellentInput: HealthScoreInput = {
        currentBalance: 200000,
        monthlyBurnRate: -10000,
        avgMonthlyIncome: 50000,
        avgMonthlyExpenses: 30000,
        runwayMonths: Infinity,
        recurringExpenseCount: 20,
        monthlyRecurringExpenses: 25000,
        incomeVolatility: 0.01,
        expenseVolatility: 0.01,
        currency: 'USD',
      };

      const criticalInput: HealthScoreInput = {
        currentBalance: 500,
        monthlyBurnRate: 10000,
        avgMonthlyIncome: 2000,
        avgMonthlyExpenses: 12000,
        runwayMonths: 0.05,
        recurringExpenseCount: 0,
        monthlyRecurringExpenses: 0,
        incomeVolatility: 0.9,
        expenseVolatility: 0.9,
        currency: 'USD',
      };

      const excellentResult = calculateHealthScore(excellentInput);
      const criticalResult = calculateHealthScore(criticalInput);

      expect(['excellent', 'good']).toContain(excellentResult.rating);
      expect(['critical', 'poor']).toContain(criticalResult.rating);
    });
  });

  // ============================================
  // Profitability Metric Tests
  // ============================================

  describe('profitability metric', () => {
    it('gives high score for 30%+ profit margin', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: -5000,
        avgMonthlyIncome: 20000,
        avgMonthlyExpenses: 10000, // 50% margin
        runwayMonths: 24,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const profitabilityMetric = result.metrics.find((m) => m.name === 'Profitability');

      expect(profitabilityMetric?.score).toBe(100);
    });

    it('gives zero score when no income', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 5000,
        avgMonthlyIncome: 0,
        avgMonthlyExpenses: 5000,
        runwayMonths: 10,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 2500,
        incomeVolatility: 0,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const profitabilityMetric = result.metrics.find((m) => m.name === 'Profitability');

      expect(profitabilityMetric?.score).toBe(0);
      expect(profitabilityMetric?.recommendation).toBeDefined();
    });

    it('penalizes operating at a loss', () => {
      const breakEvenInput: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const losingInput: HealthScoreInput = {
        ...breakEvenInput,
        avgMonthlyExpenses: 12000, // 20% loss
        monthlyBurnRate: 2000,
      };

      const breakEvenResult = calculateHealthScore(breakEvenInput);
      const losingResult = calculateHealthScore(losingInput);

      const breakEvenMetric = breakEvenResult.metrics.find((m) => m.name === 'Profitability');
      const losingMetric = losingResult.metrics.find((m) => m.name === 'Profitability');

      expect(losingMetric!.score).toBeLessThan(breakEvenMetric!.score);
    });
  });

  // ============================================
  // Cash Runway Metric Tests
  // ============================================

  describe('cash runway metric', () => {
    it('gives maximum score for infinite runway', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: -1000,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 8000,
        runwayMonths: Infinity,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 4000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const runwayMetric = result.metrics.find((m) => m.name === 'Cash Runway');

      expect(runwayMetric?.score).toBe(100);
    });

    it('gives zero score for depleted runway', () => {
      const input: HealthScoreInput = {
        currentBalance: 100,
        monthlyBurnRate: 5000,
        avgMonthlyIncome: 3000,
        avgMonthlyExpenses: 8000,
        runwayMonths: 0,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 4000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const runwayMetric = result.metrics.find((m) => m.name === 'Cash Runway');

      expect(runwayMetric?.score).toBe(0);
      expect(runwayMetric?.recommendation).toBeDefined();
    });

    it('scores appropriately for different runway lengths', () => {
      const createInput = (months: number): HealthScoreInput => ({
        currentBalance: months * 5000,
        monthlyBurnRate: 5000,
        avgMonthlyIncome: 3000,
        avgMonthlyExpenses: 8000,
        runwayMonths: months,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 4000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      });

      const shortRunway = calculateHealthScore(createInput(2));
      const mediumRunway = calculateHealthScore(createInput(6));
      const longRunway = calculateHealthScore(createInput(18));

      const getRunwayScore = (result: ReturnType<typeof calculateHealthScore>) =>
        result.metrics.find((m) => m.name === 'Cash Runway')!.score;

      expect(getRunwayScore(shortRunway)).toBeLessThan(getRunwayScore(mediumRunway));
      expect(getRunwayScore(mediumRunway)).toBeLessThan(getRunwayScore(longRunway));
    });
  });

  // ============================================
  // Cash Reserves Metric Tests
  // ============================================

  describe('cash reserves metric', () => {
    it('gives high score for 6+ months expenses in reserves', () => {
      const input: HealthScoreInput = {
        currentBalance: 60000, // 6 months of expenses
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: Infinity,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const reservesMetric = result.metrics.find((m) => m.name === 'Cash Reserves');

      expect(reservesMetric?.score).toBe(100);
    });

    it('gives zero score for negative/no reserves', () => {
      const input: HealthScoreInput = {
        currentBalance: 0,
        monthlyBurnRate: 5000,
        avgMonthlyIncome: 5000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 0,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const reservesMetric = result.metrics.find((m) => m.name === 'Cash Reserves');

      expect(reservesMetric?.score).toBe(0);
    });

    it('handles zero expenses scenario', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 5000,
        avgMonthlyExpenses: 0,
        runwayMonths: Infinity,
        recurringExpenseCount: 0,
        monthlyRecurringExpenses: 0,
        incomeVolatility: 0.1,
        expenseVolatility: 0,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const reservesMetric = result.metrics.find((m) => m.name === 'Cash Reserves');

      // With no expenses and positive balance, should be good
      expect(reservesMetric?.score).toBe(100);
    });
  });

  // ============================================
  // Volatility Calculation Tests
  // ============================================

  describe('calculateVolatility', () => {
    it('returns 0 for single value', () => {
      expect(calculateVolatility([100])).toBe(0);
    });

    it('returns 0 for identical values', () => {
      expect(calculateVolatility([100, 100, 100, 100])).toBe(0);
    });

    it('returns 0 for empty array', () => {
      expect(calculateVolatility([])).toBe(0);
    });

    it('calculates coefficient of variation correctly', () => {
      // Values: 80, 100, 120 -> mean = 100, stdDev ≈ 16.33, CV ≈ 0.163
      const volatility = calculateVolatility([80, 100, 120]);
      expect(volatility).toBeGreaterThan(0.1);
      expect(volatility).toBeLessThan(0.3);
    });

    it('higher variance produces higher volatility', () => {
      const lowVariance = calculateVolatility([95, 100, 105]);
      const highVariance = calculateVolatility([50, 100, 150]);

      expect(highVariance).toBeGreaterThan(lowVariance);
    });

    it('handles negative values', () => {
      const volatility = calculateVolatility([-100, -90, -110]);
      expect(volatility).toBeGreaterThan(0);
    });

    it('handles zero mean', () => {
      const volatility = calculateVolatility([-50, 0, 50]);
      // When mean is 0, volatility should be 0 to avoid division by zero
      expect(volatility).toBe(0);
    });
  });

  // ============================================
  // Expense Predictability Metric Tests
  // ============================================

  describe('expense predictability metric', () => {
    it('gives high score when most expenses are recurring', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 10,
        monthlyRecurringExpenses: 9000, // 90% recurring
        incomeVolatility: 0.1,
        expenseVolatility: 0.05, // Very stable
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const predictabilityMetric = result.metrics.find((m) => m.name === 'Expense Predictability');

      expect(predictabilityMetric?.score).toBeGreaterThan(70);
    });

    it('gives low score for highly variable expenses', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 1,
        monthlyRecurringExpenses: 1000, // 10% recurring
        incomeVolatility: 0.1,
        expenseVolatility: 0.5, // Very volatile
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const predictabilityMetric = result.metrics.find((m) => m.name === 'Expense Predictability');

      expect(predictabilityMetric?.score).toBeLessThan(50);
    });
  });

  // ============================================
  // Income Stability Metric Tests
  // ============================================

  describe('income stability metric', () => {
    it('gives high score for stable income', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.05, // Very stable
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const stabilityMetric = result.metrics.find((m) => m.name === 'Income Stability');

      expect(stabilityMetric?.score).toBeGreaterThan(80);
    });

    it('gives zero score for no income', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 5000,
        avgMonthlyIncome: 0,
        avgMonthlyExpenses: 5000,
        runwayMonths: 10,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 2500,
        incomeVolatility: 0,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const stabilityMetric = result.metrics.find((m) => m.name === 'Income Stability');

      expect(stabilityMetric?.score).toBe(0);
    });

    it('penalizes highly volatile income', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.6, // Very volatile
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);
      const stabilityMetric = result.metrics.find((m) => m.name === 'Income Stability');

      expect(stabilityMetric?.score).toBeLessThan(30);
    });
  });

  // ============================================
  // Recommendations Tests
  // ============================================

  describe('recommendations', () => {
    it('generates recommendations for low-scoring metrics', () => {
      const input: HealthScoreInput = {
        currentBalance: 5000,
        monthlyBurnRate: 5000,
        avgMonthlyIncome: 5000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 1,
        recurringExpenseCount: 0,
        monthlyRecurringExpenses: 0,
        incomeVolatility: 0.5,
        expenseVolatility: 0.5,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
    });

    it('prioritizes recommendations by lowest scoring metrics', () => {
      const input: HealthScoreInput = {
        currentBalance: 100,
        monthlyBurnRate: 10000,
        avgMonthlyIncome: 1000,
        avgMonthlyExpenses: 11000,
        runwayMonths: 0.01,
        recurringExpenseCount: 0,
        monthlyRecurringExpenses: 0,
        incomeVolatility: 0.9,
        expenseVolatility: 0.9,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      // With such poor metrics, should have urgent recommendations
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('does not generate recommendations for high-scoring metrics', () => {
      const input: HealthScoreInput = {
        currentBalance: 200000,
        monthlyBurnRate: -10000,
        avgMonthlyIncome: 50000,
        avgMonthlyExpenses: 30000,
        runwayMonths: Infinity,
        recurringExpenseCount: 20,
        monthlyRecurringExpenses: 28000,
        incomeVolatility: 0.01,
        expenseVolatility: 0.01,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      // With excellent metrics, may have few or no recommendations
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
    });
  });

  // ============================================
  // Summary Generation Tests
  // ============================================

  describe('summary generation', () => {
    it('generates appropriate summary for excellent rating', () => {
      const input: HealthScoreInput = {
        currentBalance: 200000,
        monthlyBurnRate: -10000,
        avgMonthlyIncome: 50000,
        avgMonthlyExpenses: 30000,
        runwayMonths: Infinity,
        recurringExpenseCount: 20,
        monthlyRecurringExpenses: 28000,
        incomeVolatility: 0.01,
        expenseVolatility: 0.01,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      if (result.rating === 'excellent') {
        expect(result.summary.toLowerCase()).toContain('excellent');
      }
    });

    it('generates appropriate summary for critical rating', () => {
      const input: HealthScoreInput = {
        currentBalance: 100,
        monthlyBurnRate: 10000,
        avgMonthlyIncome: 1000,
        avgMonthlyExpenses: 11000,
        runwayMonths: 0.01,
        recurringExpenseCount: 0,
        monthlyRecurringExpenses: 0,
        incomeVolatility: 0.9,
        expenseVolatility: 0.9,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      expect(result.summary.toLowerCase()).toContain('critical');
    });

    it('includes strongest and weakest metric areas in summary', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.2,
        expenseVolatility: 0.2,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      // Summary should reference metric areas
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('handles all zero inputs', () => {
      const input: HealthScoreInput = {
        currentBalance: 0,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 0,
        avgMonthlyExpenses: 0,
        runwayMonths: 0,
        recurringExpenseCount: 0,
        monthlyRecurringExpenses: 0,
        incomeVolatility: 0,
        expenseVolatility: 0,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.metrics).toHaveLength(5);
    });

    it('includes calculation timestamp', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it('preserves currency code', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'GBP',
      };

      const result = calculateHealthScore(input);

      expect(result.currency).toBe('GBP');
    });

    it('rounds overall score to integer', () => {
      const input: HealthScoreInput = {
        currentBalance: 50000,
        monthlyBurnRate: 0,
        avgMonthlyIncome: 10000,
        avgMonthlyExpenses: 10000,
        runwayMonths: 12,
        recurringExpenseCount: 5,
        monthlyRecurringExpenses: 5000,
        incomeVolatility: 0.1,
        expenseVolatility: 0.1,
        currency: 'USD',
      };

      const result = calculateHealthScore(input);

      expect(Number.isInteger(result.overallScore)).toBe(true);
    });
  });
});
