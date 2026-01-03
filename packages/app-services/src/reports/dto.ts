/**
 * Reports DTOs - API request/response types for report endpoints
 */

import { z } from 'zod';

// Query schema for forecast endpoint
export const forecastQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  months: z.coerce.number().int().min(3).max(12).default(6),
});

export type ForecastQuery = z.infer<typeof forecastQuerySchema>;

// Query schema for health score endpoint
export const healthScoreQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

export type HealthScoreQuery = z.infer<typeof healthScoreQuerySchema>;

// Response types
export interface ForecastMonthDto {
  month: string;
  label: string;
  projectedIncome: number;
  projectedExpenses: number;
  netCashflow: number;
  projectedBalance: number;
  confidence: number;
  isActual: boolean;
}

export interface ForecastSummaryDto {
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
  totalRecurringExpenses: number;
  totalRecurringIncome: number;
  endingBalance: number;
  monthsUntilNegative: number | null;
  trend: 'improving' | 'stable' | 'declining';
  insights: string[];
}

export interface ForecastDto {
  currency: string;
  currentBalance: number;
  overallConfidence: number;
  generatedAt: string;
  months: ForecastMonthDto[];
  summary: ForecastSummaryDto;
  recurring: {
    expenses: Array<{
      name: string;
      amount: number;
      frequency: string;
      monthlyAmount: number;
      category?: string;
    }>;
    income: Array<{
      name: string;
      amount: number;
      frequency: string;
      monthlyAmount: number;
      category?: string;
    }>;
  };
  dataQuality: {
    historicalMonths: number;
    recurringExpensesDetected: number;
    recurringIncomeDetected: number;
    transactionsAnalyzed: number;
  };
}

export interface HealthScoreMetricDto {
  name: string;
  score: number;
  weight: number;
  rating: string;
  description: string;
  recommendation?: string;
}

export interface HealthScoreDto {
  overallScore: number;
  rating: string;
  grade: string;
  summary: string;
  calculatedAt: string;
  currency: string;
  metrics: HealthScoreMetricDto[];
  recommendations: string[];
  data: {
    currentBalance: number;
    avgMonthlyIncome: number;
    avgMonthlyExpenses: number;
    monthlyBurnRate: number;
    runwayMonths: number;
    recurringExpenseCount: number;
    monthlyRecurringExpenses: number;
    incomeVolatility: number;
    expenseVolatility: number;
    monthsAnalyzed: number;
    transactionsAnalyzed: number;
  };
}
