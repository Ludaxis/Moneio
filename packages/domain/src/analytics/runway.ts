/**
 * Cash Runway Calculator
 *
 * Calculates how many months of runway a business has based on:
 * - Current cash balance
 * - Average monthly burn rate (expenses - income)
 *
 * Status thresholds:
 * - Critical: < 3 months
 * - Warning: 3-6 months
 * - Healthy: 6-12 months
 * - Excellent: 12+ months
 */

import type { MonthlySummary, RunwayCalculationInput, RunwayMetrics, RunwayStatus } from './types';

/**
 * Status thresholds in months
 */
const STATUS_THRESHOLDS = {
  critical: 3,
  warning: 6,
  healthy: 12,
};

/**
 * Calculate cash runway metrics
 */
export function calculateRunway(input: RunwayCalculationInput): RunwayMetrics {
  const { currentBalance, monthlySummaries, currency } = input;

  // Need at least 1 month of data
  if (monthlySummaries.length === 0) {
    return createEmptyRunway(currentBalance, currency);
  }

  // Calculate averages from recent months (use last 3 months or all available)
  const recentMonths = monthlySummaries.slice(-3);

  const avgMonthlyIncome = recentMonths.reduce((sum, m) => sum + m.income, 0) / recentMonths.length;

  const avgMonthlyExpenses =
    recentMonths.reduce((sum, m) => sum + m.expenses, 0) / recentMonths.length;

  // Burn rate = expenses - income (positive means spending more than earning)
  const monthlyBurnRate = avgMonthlyExpenses - avgMonthlyIncome;

  // Calculate runway
  let monthsRemaining: number;
  let projectedZeroDate: Date | null = null;

  if (monthlyBurnRate <= 0) {
    // Profitable or break-even - infinite runway
    monthsRemaining = Infinity;
  } else if (currentBalance <= 0) {
    // Already out of cash
    monthsRemaining = 0;
    projectedZeroDate = new Date();
  } else {
    // Calculate months until cash runs out
    monthsRemaining = currentBalance / monthlyBurnRate;

    // Calculate projected zero date
    projectedZeroDate = new Date();
    projectedZeroDate.setMonth(projectedZeroDate.getMonth() + Math.floor(monthsRemaining));
  }

  // Determine status
  const status = getRunwayStatus(monthsRemaining);

  return {
    monthsRemaining: roundToOneDecimal(monthsRemaining),
    currentCash: roundToTwoDecimals(currentBalance),
    monthlyBurnRate: roundToTwoDecimals(monthlyBurnRate),
    avgMonthlyExpenses: roundToTwoDecimals(avgMonthlyExpenses),
    avgMonthlyIncome: roundToTwoDecimals(avgMonthlyIncome),
    status,
    currency,
    calculatedAt: new Date(),
    projectedZeroDate,
  };
}

/**
 * Calculate runway from transaction data
 *
 * Helper function that takes raw transaction amounts and calculates runway
 */
export function calculateRunwayFromTransactions(
  currentBalance: number,
  transactions: Array<{ postedAt: Date; amount: number }>,
  currency: string,
  lookbackMonths: number = 3
): RunwayMetrics {
  // Group transactions by month
  const monthlyMap = new Map<string, { income: number; expenses: number }>();

  for (const tx of transactions) {
    const monthKey = formatMonthKey(tx.postedAt);

    const existing = monthlyMap.get(monthKey) || { income: 0, expenses: 0 };

    if (tx.amount > 0) {
      existing.income += tx.amount;
    } else {
      existing.expenses += Math.abs(tx.amount);
    }

    monthlyMap.set(monthKey, existing);
  }

  // Convert to sorted array of monthly summaries
  const monthlySummaries: MonthlySummary[] = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({
      month,
      income: data.income,
      expenses: data.expenses,
      netCashflow: data.income - data.expenses,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-lookbackMonths);

  return calculateRunway({
    currentBalance,
    monthlySummaries,
    currency,
  });
}

/**
 * Get runway status based on months remaining
 */
export function getRunwayStatus(monthsRemaining: number): RunwayStatus {
  if (!isFinite(monthsRemaining) || monthsRemaining > STATUS_THRESHOLDS.healthy) {
    return 'excellent';
  }
  if (monthsRemaining >= STATUS_THRESHOLDS.warning) {
    return 'healthy';
  }
  if (monthsRemaining >= STATUS_THRESHOLDS.critical) {
    return 'warning';
  }
  return 'critical';
}

/**
 * Get human-readable runway description
 */
export function getRunwayDescription(metrics: RunwayMetrics): string {
  if (!isFinite(metrics.monthsRemaining)) {
    return 'Your business is profitable - you have unlimited runway!';
  }

  if (metrics.monthsRemaining <= 0) {
    return 'Critical: Your cash reserves are depleted.';
  }

  const months = Math.floor(metrics.monthsRemaining);
  const monthText = months === 1 ? 'month' : 'months';

  switch (metrics.status) {
    case 'critical':
      return `Critical: Only ${months} ${monthText} of runway remaining. Consider reducing expenses or increasing revenue.`;
    case 'warning':
      return `Warning: ${months} ${monthText} of runway remaining. Monitor your burn rate closely.`;
    case 'healthy':
      return `Healthy: ${months} ${monthText} of runway remaining.`;
    case 'excellent':
      return `Excellent: ${months}+ ${monthText} of runway. Your finances are in great shape!`;
  }
}

/**
 * Create empty runway metrics when no data is available
 */
function createEmptyRunway(currentBalance: number, currency: string): RunwayMetrics {
  return {
    monthsRemaining: currentBalance > 0 ? Infinity : 0,
    currentCash: roundToTwoDecimals(currentBalance),
    monthlyBurnRate: 0,
    avgMonthlyExpenses: 0,
    avgMonthlyIncome: 0,
    status: currentBalance > 0 ? 'excellent' : 'critical',
    currency,
    calculatedAt: new Date(),
    projectedZeroDate: null,
  };
}

/**
 * Format date to YYYY-MM key
 */
function formatMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Round to one decimal place
 */
function roundToOneDecimal(value: number): number {
  if (!isFinite(value)) return value;
  return Math.round(value * 10) / 10;
}

/**
 * Round to two decimal places
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
