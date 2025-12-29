/**
 * Analytics Types
 *
 * Types for financial analytics including runway calculation,
 * health score, and forecasting.
 */

/**
 * Runway status levels
 */
export type RunwayStatus = 'critical' | 'warning' | 'healthy' | 'excellent';

/**
 * Cash runway metrics
 */
export interface RunwayMetrics {
  /** Months of runway remaining based on current burn rate */
  monthsRemaining: number;
  /** Current cash balance (sum of all account balances) */
  currentCash: number;
  /** Average monthly burn rate (expenses - income) */
  monthlyBurnRate: number;
  /** Average monthly expenses (last 3 months) */
  avgMonthlyExpenses: number;
  /** Average monthly income (last 3 months) */
  avgMonthlyIncome: number;
  /** Status indicator */
  status: RunwayStatus;
  /** Currency code */
  currency: string;
  /** Date when runway was calculated */
  calculatedAt: Date;
  /** Projected zero-cash date (null if profitable) */
  projectedZeroDate: Date | null;
}

/**
 * Monthly financial summary for calculations
 */
export interface MonthlySummary {
  month: string; // YYYY-MM format
  income: number;
  expenses: number;
  netCashflow: number;
}

/**
 * Input for runway calculation
 */
export interface RunwayCalculationInput {
  /** Current total balance across all accounts */
  currentBalance: number;
  /** Monthly summaries for the calculation period (last 3+ months) */
  monthlySummaries: MonthlySummary[];
  /** Currency code */
  currency: string;
}

// ============================================
// Cash Flow Forecast Types
// ============================================

/**
 * Forecast confidence levels
 */
export type ForecastConfidence = 'high' | 'medium' | 'low';

/**
 * A single forecasted month
 */
export interface ForecastedMonth {
  /** Month in YYYY-MM format */
  month: string;
  /** Human readable label (e.g., "Jan '25") */
  label: string;
  /** Projected income */
  projectedIncome: number;
  /** Projected expenses */
  projectedExpenses: number;
  /** Net cashflow (income - expenses) */
  netCashflow: number;
  /** Projected end-of-month balance */
  projectedBalance: number;
  /** Confidence level for this projection */
  confidence: ForecastConfidence;
  /** Is this month historical (actual) vs forecasted */
  isActual: boolean;
}

/**
 * Recurring expense used in forecast
 */
export interface ForecastRecurringItem {
  /** Merchant or description */
  name: string;
  /** Expected amount */
  amount: number;
  /** Frequency of occurrence */
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  /** Monthly equivalent amount */
  monthlyAmount: number;
  /** Category if known */
  category?: string;
}

/**
 * Input for cash flow forecast
 */
export interface ForecastInput {
  /** Current balance */
  currentBalance: number;
  /** Historical monthly summaries (at least 3 months) */
  historicalMonths: MonthlySummary[];
  /** Detected recurring expenses */
  recurringExpenses: ForecastRecurringItem[];
  /** Detected recurring income */
  recurringIncome: ForecastRecurringItem[];
  /** Currency code */
  currency: string;
  /** Number of months to forecast (default: 6) */
  forecastMonths?: number;
}

/**
 * Cash flow forecast result
 */
export interface CashFlowForecast {
  /** Currency code */
  currency: string;
  /** Current cash balance */
  currentBalance: number;
  /** Forecasted months (includes historical for context) */
  months: ForecastedMonth[];
  /** Summary metrics */
  summary: ForecastSummary;
  /** When the forecast was generated */
  generatedAt: Date;
  /** Overall forecast confidence */
  overallConfidence: ForecastConfidence;
}

/**
 * Summary of forecast insights
 */
export interface ForecastSummary {
  /** Average monthly income (forecasted) */
  avgMonthlyIncome: number;
  /** Average monthly expenses (forecasted) */
  avgMonthlyExpenses: number;
  /** Total recurring expenses per month */
  totalRecurringExpenses: number;
  /** Total recurring income per month */
  totalRecurringIncome: number;
  /** Projected balance at end of forecast period */
  endingBalance: number;
  /** Months until negative balance (null if stays positive) */
  monthsUntilNegative: number | null;
  /** Trend direction over forecast period */
  trend: 'improving' | 'declining' | 'stable';
  /** Key insights */
  insights: string[];
}

// ============================================
// Financial Health Score Types
// ============================================

/**
 * Health score rating levels
 */
export type HealthRating = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

/**
 * Individual metric component of the health score
 */
export interface HealthMetric {
  /** Metric name */
  name: string;
  /** Score out of 100 */
  score: number;
  /** Weight in overall score (0-1) */
  weight: number;
  /** Rating based on score */
  rating: HealthRating;
  /** Human readable description */
  description: string;
  /** Recommendation if score is low */
  recommendation?: string;
}

/**
 * Input for health score calculation
 */
export interface HealthScoreInput {
  /** Current cash balance */
  currentBalance: number;
  /** Monthly burn rate (expenses - income) */
  monthlyBurnRate: number;
  /** Average monthly income */
  avgMonthlyIncome: number;
  /** Average monthly expenses */
  avgMonthlyExpenses: number;
  /** Months of runway */
  runwayMonths: number;
  /** Number of recurring expenses detected */
  recurringExpenseCount: number;
  /** Total monthly recurring expenses */
  monthlyRecurringExpenses: number;
  /** Income volatility (standard deviation / mean) */
  incomeVolatility: number;
  /** Expense volatility (standard deviation / mean) */
  expenseVolatility: number;
  /** Currency */
  currency: string;
}

/**
 * Financial health score result
 */
export interface FinancialHealthScore {
  /** Overall score (0-100) */
  overallScore: number;
  /** Overall rating */
  rating: HealthRating;
  /** Grade (A, B, C, D, F) */
  grade: string;
  /** Individual metric scores */
  metrics: HealthMetric[];
  /** Top recommendations for improvement */
  recommendations: string[];
  /** Currency */
  currency: string;
  /** When the score was calculated */
  calculatedAt: Date;
  /** Summary description */
  summary: string;
}
