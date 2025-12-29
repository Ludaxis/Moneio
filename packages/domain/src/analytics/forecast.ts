/**
 * Cash Flow Forecast Service
 *
 * Generates 3-6 month cash flow projections based on:
 * - Historical income/expense patterns
 * - Detected recurring transactions
 * - Seasonal adjustments (if enough data)
 *
 * Confidence levels:
 * - High: Based on recurring patterns with strong history
 * - Medium: Based on historical averages
 * - Low: Limited data, rough estimates
 */

import type {
  CashFlowForecast,
  ForecastConfidence,
  ForecastedMonth,
  ForecastInput,
  ForecastRecurringItem,
  ForecastSummary,
  MonthlySummary,
} from './types';

/**
 * Generate a cash flow forecast
 */
export function generateForecast(input: ForecastInput): CashFlowForecast {
  const {
    currentBalance,
    historicalMonths,
    recurringExpenses,
    recurringIncome,
    currency,
    forecastMonths = 6,
  } = input;

  // Calculate baseline averages from historical data
  const baseline = calculateBaseline(historicalMonths);

  // Calculate recurring totals
  const totalRecurringExpenses = sumMonthlyRecurring(recurringExpenses);
  const totalRecurringIncome = sumMonthlyRecurring(recurringIncome);

  // Determine overall confidence based on data quality
  const overallConfidence = determineOverallConfidence(
    historicalMonths.length,
    recurringExpenses.length + recurringIncome.length
  );

  // Generate forecasted months
  const months: ForecastedMonth[] = [];
  let runningBalance = currentBalance;

  // Include last 3 historical months for context
  const historicalContext = historicalMonths.slice(-3);
  for (const hist of historicalContext) {
    const balance = runningBalance + hist.netCashflow;
    months.push({
      month: hist.month,
      label: formatMonthLabel(hist.month),
      projectedIncome: hist.income,
      projectedExpenses: hist.expenses,
      netCashflow: hist.netCashflow,
      projectedBalance: balance,
      confidence: 'high', // Historical data is always high confidence
      isActual: true,
    });
    runningBalance = balance;
  }

  // Reset to current balance for forecasting
  runningBalance = currentBalance;

  // Generate future months
  const startMonth = getNextMonth(new Date());
  for (let i = 0; i < forecastMonths; i++) {
    const monthDate = addMonths(startMonth, i);
    const monthKey = formatMonthKey(monthDate);

    // Project income: recurring + variable (based on historical average)
    const variableIncome = Math.max(0, baseline.avgIncome - totalRecurringIncome);
    const projectedIncome = totalRecurringIncome + variableIncome * getSeasonalFactor(monthDate, historicalMonths);

    // Project expenses: recurring + variable (based on historical average)
    const variableExpenses = Math.max(0, baseline.avgExpenses - totalRecurringExpenses);
    const projectedExpenses = totalRecurringExpenses + variableExpenses * getSeasonalFactor(monthDate, historicalMonths);

    const netCashflow = projectedIncome - projectedExpenses;
    runningBalance += netCashflow;

    // Confidence decreases over time
    const confidence = getMonthConfidence(i, overallConfidence);

    months.push({
      month: monthKey,
      label: formatMonthLabel(monthKey),
      projectedIncome: roundToTwoDecimals(projectedIncome),
      projectedExpenses: roundToTwoDecimals(projectedExpenses),
      netCashflow: roundToTwoDecimals(netCashflow),
      projectedBalance: roundToTwoDecimals(runningBalance),
      confidence,
      isActual: false,
    });
  }

  // Calculate summary
  const summary = calculateSummary(
    months.filter((m) => !m.isActual),
    totalRecurringExpenses,
    totalRecurringIncome,
    currentBalance
  );

  return {
    currency,
    currentBalance,
    months,
    summary,
    generatedAt: new Date(),
    overallConfidence,
  };
}

/**
 * Calculate baseline averages from historical data
 */
function calculateBaseline(historicalMonths: MonthlySummary[]): {
  avgIncome: number;
  avgExpenses: number;
  incomeGrowth: number;
  expenseGrowth: number;
} {
  if (historicalMonths.length === 0) {
    return { avgIncome: 0, avgExpenses: 0, incomeGrowth: 0, expenseGrowth: 0 };
  }

  // Use last 3 months for averages
  const recentMonths = historicalMonths.slice(-3);
  const avgIncome = recentMonths.reduce((sum, m) => sum + m.income, 0) / recentMonths.length;
  const avgExpenses = recentMonths.reduce((sum, m) => sum + m.expenses, 0) / recentMonths.length;

  // Calculate growth trends if we have enough data
  let incomeGrowth = 0;
  let expenseGrowth = 0;

  if (historicalMonths.length >= 6) {
    const firstHalf = historicalMonths.slice(0, 3);
    const secondHalf = historicalMonths.slice(-3);

    const firstAvgIncome = firstHalf.reduce((sum, m) => sum + m.income, 0) / firstHalf.length;
    const secondAvgIncome = secondHalf.reduce((sum, m) => sum + m.income, 0) / secondHalf.length;

    const firstAvgExpenses = firstHalf.reduce((sum, m) => sum + m.expenses, 0) / firstHalf.length;
    const secondAvgExpenses = secondHalf.reduce((sum, m) => sum + m.expenses, 0) / secondHalf.length;

    incomeGrowth = firstAvgIncome > 0 ? (secondAvgIncome - firstAvgIncome) / firstAvgIncome : 0;
    expenseGrowth = firstAvgExpenses > 0 ? (secondAvgExpenses - firstAvgExpenses) / firstAvgExpenses : 0;
  }

  return { avgIncome, avgExpenses, incomeGrowth, expenseGrowth };
}

/**
 * Sum monthly equivalent of recurring items
 */
function sumMonthlyRecurring(items: ForecastRecurringItem[]): number {
  return items.reduce((sum, item) => sum + item.monthlyAmount, 0);
}

/**
 * Get seasonal adjustment factor for a month
 * Based on historical patterns if available
 */
function getSeasonalFactor(date: Date, historicalMonths: MonthlySummary[]): number {
  // If not enough historical data, return neutral factor
  if (historicalMonths.length < 12) {
    return 1.0;
  }

  const targetMonth = date.getMonth(); // 0-11
  const sameMonthData = historicalMonths.filter((m) => {
    const monthNum = parseInt(m.month.split('-')[1]) - 1;
    return monthNum === targetMonth;
  });

  if (sameMonthData.length === 0) {
    return 1.0;
  }

  const avgAll = historicalMonths.reduce((sum, m) => sum + m.income + m.expenses, 0) / historicalMonths.length;
  const avgSameMonth = sameMonthData.reduce((sum, m) => sum + m.income + m.expenses, 0) / sameMonthData.length;

  if (avgAll === 0) return 1.0;

  // Limit factor to reasonable range
  const factor = avgSameMonth / avgAll;
  return Math.max(0.5, Math.min(1.5, factor));
}

/**
 * Determine overall forecast confidence
 */
function determineOverallConfidence(
  historicalMonthCount: number,
  recurringItemCount: number
): ForecastConfidence {
  if (historicalMonthCount >= 6 && recurringItemCount >= 5) {
    return 'high';
  }
  if (historicalMonthCount >= 3 && recurringItemCount >= 2) {
    return 'medium';
  }
  return 'low';
}

/**
 * Get confidence for a specific forecasted month
 * Confidence decreases as we forecast further out
 */
function getMonthConfidence(monthIndex: number, baseConfidence: ForecastConfidence): ForecastConfidence {
  if (baseConfidence === 'low') return 'low';

  if (monthIndex <= 1) {
    return baseConfidence;
  }
  if (monthIndex <= 3) {
    return baseConfidence === 'high' ? 'medium' : 'low';
  }
  return 'low';
}

/**
 * Calculate forecast summary
 */
function calculateSummary(
  forecastedMonths: ForecastedMonth[],
  totalRecurringExpenses: number,
  totalRecurringIncome: number,
  currentBalance: number
): ForecastSummary {
  if (forecastedMonths.length === 0) {
    return {
      avgMonthlyIncome: 0,
      avgMonthlyExpenses: 0,
      totalRecurringExpenses,
      totalRecurringIncome,
      endingBalance: currentBalance,
      monthsUntilNegative: null,
      trend: 'stable',
      insights: ['Not enough data to generate forecast'],
    };
  }

  const avgMonthlyIncome =
    forecastedMonths.reduce((sum, m) => sum + m.projectedIncome, 0) / forecastedMonths.length;
  const avgMonthlyExpenses =
    forecastedMonths.reduce((sum, m) => sum + m.projectedExpenses, 0) / forecastedMonths.length;

  const endingBalance = forecastedMonths[forecastedMonths.length - 1].projectedBalance;

  // Find when balance goes negative
  let monthsUntilNegative: number | null = null;
  for (let i = 0; i < forecastedMonths.length; i++) {
    if (forecastedMonths[i].projectedBalance < 0) {
      monthsUntilNegative = i + 1;
      break;
    }
  }

  // Determine trend
  const firstHalf = forecastedMonths.slice(0, Math.ceil(forecastedMonths.length / 2));
  const secondHalf = forecastedMonths.slice(Math.ceil(forecastedMonths.length / 2));

  const firstAvgNet = firstHalf.reduce((sum, m) => sum + m.netCashflow, 0) / firstHalf.length;
  const secondAvgNet = secondHalf.reduce((sum, m) => sum + m.netCashflow, 0) / secondHalf.length;

  let trend: 'improving' | 'declining' | 'stable';
  const changePercent = firstAvgNet !== 0 ? (secondAvgNet - firstAvgNet) / Math.abs(firstAvgNet) : 0;

  if (changePercent > 0.1) {
    trend = 'improving';
  } else if (changePercent < -0.1) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }

  // Generate insights
  const insights = generateInsights(
    avgMonthlyIncome,
    avgMonthlyExpenses,
    totalRecurringExpenses,
    monthsUntilNegative,
    trend,
    endingBalance,
    currentBalance
  );

  return {
    avgMonthlyIncome: roundToTwoDecimals(avgMonthlyIncome),
    avgMonthlyExpenses: roundToTwoDecimals(avgMonthlyExpenses),
    totalRecurringExpenses: roundToTwoDecimals(totalRecurringExpenses),
    totalRecurringIncome: roundToTwoDecimals(totalRecurringIncome),
    endingBalance: roundToTwoDecimals(endingBalance),
    monthsUntilNegative,
    trend,
    insights,
  };
}

/**
 * Generate human-readable insights
 */
function generateInsights(
  avgIncome: number,
  avgExpenses: number,
  recurringExpenses: number,
  monthsUntilNegative: number | null,
  trend: 'improving' | 'declining' | 'stable',
  endingBalance: number,
  currentBalance: number
): string[] {
  const insights: string[] = [];

  // Profitability insight
  if (avgIncome > avgExpenses) {
    const surplus = avgIncome - avgExpenses;
    insights.push(`Projected monthly surplus of ${formatCurrency(surplus)}`);
  } else if (avgExpenses > avgIncome) {
    const deficit = avgExpenses - avgIncome;
    insights.push(`Projected monthly deficit of ${formatCurrency(deficit)}`);
  }

  // Recurring expenses insight
  if (recurringExpenses > 0) {
    const recurringPercent = (recurringExpenses / avgExpenses) * 100;
    insights.push(`${recurringPercent.toFixed(0)}% of expenses are recurring/predictable`);
  }

  // Cash runway insight
  if (monthsUntilNegative !== null) {
    insights.push(`Warning: Cash may run out in ${monthsUntilNegative} month${monthsUntilNegative === 1 ? '' : 's'}`);
  } else if (endingBalance > currentBalance * 1.2) {
    insights.push('Cash position improving over forecast period');
  }

  // Trend insight
  if (trend === 'improving') {
    insights.push('Financial trend is improving');
  } else if (trend === 'declining') {
    insights.push('Financial trend is declining - monitor closely');
  }

  return insights;
}

/**
 * Convert recurring item to monthly amount
 */
export function toMonthlyAmount(amount: number, frequency: ForecastRecurringItem['frequency']): number {
  switch (frequency) {
    case 'weekly':
      return amount * 4.33; // Average weeks per month
    case 'biweekly':
      return amount * 2.17;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'annual':
      return amount / 12;
    default:
      return amount;
  }
}

// ============================================
// Helper Functions
// ============================================

function getNextMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  next.setDate(1);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
