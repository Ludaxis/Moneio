/**
 * Dashboard DTOs - API response types
 */

import { z } from 'zod';

// Query parameters schema
export const dashboardQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  period: z.enum(['last7', 'last30', 'month', 'quarter', 'year', 'ytd']).default('month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

// Money value DTO
export interface MoneyDto {
  amount: number;
  currency: string;
  formatted: string;
}

// Trend DTO
export interface TrendDto {
  percentageChange: number;
  direction: 'up' | 'down' | 'stable';
  currentMonth: { amount: number; currency: string };
  previousMonth: { amount: number; currency: string };
}

// Category breakdown item
export interface CategoryBreakdownDto {
  categoryId: string | null;
  categoryName: string | null;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  percentage: number;
  transactionCount: number;
}

// Monthly chart data
export interface MonthlyDataDto {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  netCashflow: number;
}

// Runway metrics
export interface RunwayDto {
  monthsRemaining: number | null;
  currentCash: number;
  monthlyBurnRate: number;
  avgMonthlyExpenses: number;
  avgMonthlyIncome: number;
  status: 'excellent' | 'healthy' | 'warning' | 'critical' | 'growing';
  projectedZeroDate: string | null;
  description: string;
}

// Dashboard metrics response
export interface DashboardMetricsDto {
  period: { startDate: string; endDate: string };
  baseCurrency: string;
  totalIncome: MoneyDto;
  totalExpenses: MoneyDto;
  netCashflow: MoneyDto;
  burnRate: MoneyDto;
  runway: RunwayDto;
  trend: TrendDto;
  categoryBreakdown: CategoryBreakdownDto[];
  monthlyData: MonthlyDataDto[];
}

// Recent transaction summary for dashboard
export interface TransactionSummaryDto {
  id: string;
  postedAt: string;
  description: string | null;
  amount: string;
  currency: string;
  categoryName: string | null;
}
