/**
 * Anomaly Detection Service
 *
 * Detects unusual patterns in financial data including:
 * - Spending anomalies (unusually high/low monthly spending)
 * - Income anomalies (unexpected income changes)
 * - Category anomalies (unusual spending in specific categories)
 * - Merchant anomalies (unusual charges from specific merchants)
 */

import type { TransactionInput } from '../transactions/recurring-detector';

/**
 * Configuration for anomaly detection
 */
export interface AnomalyConfig {
  /** Standard deviation threshold for spending anomalies (default: 1.5) */
  spendingThreshold: number;
  /** Standard deviation threshold for income anomalies (default: 1.5) */
  incomeThreshold: number;
  /** Minimum months of data required (default: 3) */
  minDataPoints: number;
  /** Number of months to analyze (default: 6) */
  lookbackPeriod: number;
  /** Minimum percentage change to consider significant (default: 20) */
  minPercentageChange: number;
}

/**
 * Default configuration
 */
export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  spendingThreshold: 1.5,
  incomeThreshold: 1.5,
  minDataPoints: 3,
  lookbackPeriod: 6,
  minPercentageChange: 20,
};

/**
 * Severity of detected anomaly
 */
export type AnomalySeverity = 'minor' | 'significant' | 'major';

/**
 * Type of anomaly detected
 */
export type AnomalyType = 'spending' | 'income' | 'category' | 'merchant';

/**
 * A detected anomaly
 */
export interface Anomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  expected: number;
  actual: number;
  deviation: number;
  deviationPercent: number;
  affectedPeriod: { start: Date; end: Date };
  relatedTransactions: string[];
  currency: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input for anomaly detection
 */
export interface AnomalyDetectionInput {
  transactions: TransactionInput[];
  config?: Partial<AnomalyConfig>;
}

/**
 * Quality of data for analysis
 */
export type DataQuality = 'insufficient' | 'limited' | 'good';

/**
 * Result of anomaly detection
 */
export interface AnomalyDetectionResult {
  anomalies: Anomaly[];
  periodAnalyzed: { start: Date; end: Date };
  dataQuality: DataQuality;
  monthsAnalyzed: number;
  statistics: {
    avgMonthlySpending: number;
    avgMonthlyIncome: number;
    spendingStdDev: number;
    incomeStdDev: number;
  };
}

/**
 * Main function: Detect all anomalies from transactions
 */
export function detectAnomalies(input: AnomalyDetectionInput): AnomalyDetectionResult {
  const config = { ...DEFAULT_ANOMALY_CONFIG, ...input.config };
  const { transactions } = input;

  if (transactions.length === 0) {
    return createEmptyResult();
  }

  // Group transactions by month
  const { monthlyData, periodAnalyzed, currency } = groupByMonth(
    transactions,
    config.lookbackPeriod
  );
  const monthCount = Object.keys(monthlyData).length;

  // Determine data quality
  const dataQuality = getDataQuality(monthCount, config.minDataPoints);

  // Calculate statistics
  const statistics = calculateStatistics(monthlyData);

  // Detect anomalies if we have enough data
  const anomalies: Anomaly[] = [];

  if (dataQuality !== 'insufficient') {
    // Detect spending anomalies
    anomalies.push(...detectSpendingAnomalies(monthlyData, statistics, config, currency));

    // Detect income anomalies
    anomalies.push(...detectIncomeAnomalies(monthlyData, statistics, config, currency));

    // Detect category anomalies
    anomalies.push(...detectCategoryAnomalies(transactions, config, currency));

    // Detect merchant anomalies
    anomalies.push(...detectMerchantAnomalies(transactions, config, currency));
  }

  // Sort anomalies by severity (major first)
  anomalies.sort((a, b) => {
    const severityOrder = { major: 0, significant: 1, minor: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return {
    anomalies,
    periodAnalyzed,
    dataQuality,
    monthsAnalyzed: monthCount,
    statistics: {
      avgMonthlySpending: Math.round(statistics.avgSpending * 100) / 100,
      avgMonthlyIncome: Math.round(statistics.avgIncome * 100) / 100,
      spendingStdDev: Math.round(statistics.spendingStdDev * 100) / 100,
      incomeStdDev: Math.round(statistics.incomeStdDev * 100) / 100,
    },
  };
}

/**
 * Group transactions by month
 */
interface MonthlyData {
  spending: number;
  income: number;
  transactionIds: string[];
  start: Date;
  end: Date;
}

function groupByMonth(
  transactions: TransactionInput[],
  lookbackMonths: number
): {
  monthlyData: Record<string, MonthlyData>;
  periodAnalyzed: { start: Date; end: Date };
  currency: string;
} {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);

  const monthlyData: Record<string, MonthlyData> = {};
  let currency = 'EUR';
  let minDate = new Date();
  let maxDate = new Date(0);

  for (const tx of transactions) {
    if (tx.postedAt < cutoffDate) continue;

    const monthKey = `${tx.postedAt.getFullYear()}-${String(tx.postedAt.getMonth() + 1).padStart(2, '0')}`;
    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();

    if (!monthlyData[monthKey]) {
      const monthStart = new Date(tx.postedAt.getFullYear(), tx.postedAt.getMonth(), 1);
      const monthEnd = new Date(tx.postedAt.getFullYear(), tx.postedAt.getMonth() + 1, 0);
      monthlyData[monthKey] = {
        spending: 0,
        income: 0,
        transactionIds: [],
        start: monthStart,
        end: monthEnd,
      };
    }

    if (amount < 0) {
      monthlyData[monthKey].spending += Math.abs(amount);
    } else {
      monthlyData[monthKey].income += amount;
    }

    monthlyData[monthKey].transactionIds.push(tx.id);
    currency = tx.currency;

    if (tx.postedAt < minDate) minDate = tx.postedAt;
    if (tx.postedAt > maxDate) maxDate = tx.postedAt;
  }

  return {
    monthlyData,
    periodAnalyzed: { start: minDate, end: maxDate },
    currency,
  };
}

/**
 * Calculate statistics from monthly data
 */
interface Statistics {
  avgSpending: number;
  avgIncome: number;
  spendingStdDev: number;
  incomeStdDev: number;
  spendingValues: number[];
  incomeValues: number[];
}

function calculateStatistics(monthlyData: Record<string, MonthlyData>): Statistics {
  const spendingValues = Object.values(monthlyData).map((m) => m.spending);
  const incomeValues = Object.values(monthlyData).map((m) => m.income);

  const avgSpending =
    spendingValues.length > 0
      ? spendingValues.reduce((a, b) => a + b, 0) / spendingValues.length
      : 0;

  const avgIncome =
    incomeValues.length > 0 ? incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length : 0;

  const spendingStdDev = calculateStdDev(spendingValues, avgSpending);
  const incomeStdDev = calculateStdDev(incomeValues, avgIncome);

  return {
    avgSpending,
    avgIncome,
    spendingStdDev,
    incomeStdDev,
    spendingValues,
    incomeValues,
  };
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Determine data quality based on months of data
 */
function getDataQuality(monthCount: number, minRequired: number): DataQuality {
  if (monthCount < minRequired) return 'insufficient';
  if (monthCount < minRequired * 2) return 'limited';
  return 'good';
}

/**
 * Detect spending anomalies
 */
function detectSpendingAnomalies(
  monthlyData: Record<string, MonthlyData>,
  stats: Statistics,
  config: AnomalyConfig,
  currency: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (stats.spendingStdDev === 0) return anomalies;

  for (const [_monthKey, data] of Object.entries(monthlyData)) {
    const deviation = (data.spending - stats.avgSpending) / stats.spendingStdDev;
    const deviationPercent = ((data.spending - stats.avgSpending) / stats.avgSpending) * 100;

    if (
      Math.abs(deviation) >= config.spendingThreshold &&
      Math.abs(deviationPercent) >= config.minPercentageChange
    ) {
      const severity = getSeverity(Math.abs(deviation));
      const direction = deviation > 0 ? 'above' : 'below';

      anomalies.push({
        type: 'spending',
        severity,
        description: `Spending ${direction} average by ${Math.abs(deviationPercent).toFixed(1)}%`,
        expected: stats.avgSpending,
        actual: data.spending,
        deviation: Math.round(deviation * 100) / 100,
        deviationPercent: Math.round(deviationPercent * 100) / 100,
        affectedPeriod: { start: data.start, end: data.end },
        relatedTransactions: data.transactionIds,
        currency,
        metadata: { direction },
      });
    }
  }

  return anomalies;
}

/**
 * Detect income anomalies
 */
function detectIncomeAnomalies(
  monthlyData: Record<string, MonthlyData>,
  stats: Statistics,
  config: AnomalyConfig,
  currency: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (stats.incomeStdDev === 0 || stats.avgIncome === 0) return anomalies;

  for (const [_monthKey, data] of Object.entries(monthlyData)) {
    const deviation = (data.income - stats.avgIncome) / stats.incomeStdDev;
    const deviationPercent = ((data.income - stats.avgIncome) / stats.avgIncome) * 100;

    if (
      Math.abs(deviation) >= config.incomeThreshold &&
      Math.abs(deviationPercent) >= config.minPercentageChange
    ) {
      const severity = getSeverity(Math.abs(deviation));
      const direction = deviation > 0 ? 'above' : 'below';

      anomalies.push({
        type: 'income',
        severity,
        description: `Income ${direction} average by ${Math.abs(deviationPercent).toFixed(1)}%`,
        expected: stats.avgIncome,
        actual: data.income,
        deviation: Math.round(deviation * 100) / 100,
        deviationPercent: Math.round(deviationPercent * 100) / 100,
        affectedPeriod: { start: data.start, end: data.end },
        relatedTransactions: data.transactionIds.filter((_id) => {
          // Would need transaction lookup to filter only income - keeping all for now
          return true;
        }),
        currency,
        metadata: { direction },
      });
    }
  }

  return anomalies;
}

/**
 * Detect category-level anomalies
 */
function detectCategoryAnomalies(
  transactions: TransactionInput[],
  config: AnomalyConfig,
  currency: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group by category and month
  const categoryMonthly = new Map<
    string,
    Map<string, { amount: number; transactionIds: string[]; start: Date; end: Date }>
  >();

  for (const tx of transactions) {
    // Extract categoryId from categorizations array if available
    const categoryId = tx.categorizations?.[0]?.category?.id || 'uncategorized';
    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    if (amount >= 0) continue; // Only expenses

    const monthKey = `${tx.postedAt.getFullYear()}-${String(tx.postedAt.getMonth() + 1).padStart(2, '0')}`;

    if (!categoryMonthly.has(categoryId)) {
      categoryMonthly.set(categoryId, new Map());
    }

    const categoryData = categoryMonthly.get(categoryId)!;
    if (!categoryData.has(monthKey)) {
      const monthStart = new Date(tx.postedAt.getFullYear(), tx.postedAt.getMonth(), 1);
      const monthEnd = new Date(tx.postedAt.getFullYear(), tx.postedAt.getMonth() + 1, 0);
      categoryData.set(monthKey, {
        amount: 0,
        transactionIds: [],
        start: monthStart,
        end: monthEnd,
      });
    }

    const monthData = categoryData.get(monthKey)!;
    monthData.amount += Math.abs(amount);
    monthData.transactionIds.push(tx.id);
  }

  // Analyze each category
  for (const [categoryId, monthlyMap] of categoryMonthly.entries()) {
    if (monthlyMap.size < config.minDataPoints) continue;

    const values = Array.from(monthlyMap.values()).map((m) => m.amount);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = calculateStdDev(values, avg);

    if (stdDev === 0) continue;

    for (const [_monthKey, data] of monthlyMap.entries()) {
      const deviation = (data.amount - avg) / stdDev;
      const deviationPercent = ((data.amount - avg) / avg) * 100;

      if (
        Math.abs(deviation) >= config.spendingThreshold &&
        Math.abs(deviationPercent) >= config.minPercentageChange
      ) {
        const severity = getSeverity(Math.abs(deviation));
        const direction = deviation > 0 ? 'higher' : 'lower';

        anomalies.push({
          type: 'category',
          severity,
          description: `Category spending ${direction} than usual by ${Math.abs(deviationPercent).toFixed(1)}%`,
          expected: avg,
          actual: data.amount,
          deviation: Math.round(deviation * 100) / 100,
          deviationPercent: Math.round(deviationPercent * 100) / 100,
          affectedPeriod: { start: data.start, end: data.end },
          relatedTransactions: data.transactionIds,
          currency,
          metadata: { categoryId, direction },
        });
      }
    }
  }

  return anomalies;
}

/**
 * Detect merchant-level anomalies (unusual charges from specific merchants)
 */
function detectMerchantAnomalies(
  transactions: TransactionInput[],
  config: AnomalyConfig,
  currency: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group by merchant
  const merchantData = new Map<
    string,
    { amounts: number[]; transactionIds: string[]; dates: Date[] }
  >();

  for (const tx of transactions) {
    if (!tx.description) continue;
    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    if (amount >= 0) continue;

    const merchantKey = tx.description.toLowerCase().trim();
    if (!merchantData.has(merchantKey)) {
      merchantData.set(merchantKey, { amounts: [], transactionIds: [], dates: [] });
    }

    const data = merchantData.get(merchantKey)!;
    data.amounts.push(Math.abs(amount));
    data.transactionIds.push(tx.id);
    data.dates.push(tx.postedAt);
  }

  // Analyze each merchant with enough transactions
  for (const [merchantKey, data] of merchantData.entries()) {
    if (data.amounts.length < config.minDataPoints) continue;

    const avg = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
    const stdDev = calculateStdDev(data.amounts, avg);

    if (stdDev === 0) continue;

    // Check each transaction against the merchant's average
    for (let i = 0; i < data.amounts.length; i++) {
      const amount = data.amounts[i];
      const deviation = (amount - avg) / stdDev;
      const deviationPercent = ((amount - avg) / avg) * 100;

      // Only flag significantly higher charges (not lower)
      if (deviation >= config.spendingThreshold && deviationPercent >= config.minPercentageChange) {
        const severity = getSeverity(deviation);

        anomalies.push({
          type: 'merchant',
          severity,
          description: `Charge from "${merchantKey}" is ${deviationPercent.toFixed(1)}% higher than usual`,
          expected: avg,
          actual: amount,
          deviation: Math.round(deviation * 100) / 100,
          deviationPercent: Math.round(deviationPercent * 100) / 100,
          affectedPeriod: { start: data.dates[i], end: data.dates[i] },
          relatedTransactions: [data.transactionIds[i]],
          currency,
          metadata: { merchant: merchantKey },
        });
      }
    }
  }

  return anomalies;
}

/**
 * Determine severity based on standard deviation
 */
function getSeverity(deviation: number): AnomalySeverity {
  if (deviation >= 3) return 'major';
  if (deviation >= 2) return 'significant';
  return 'minor';
}

/**
 * Create empty result for when there's no data
 */
function createEmptyResult(): AnomalyDetectionResult {
  return {
    anomalies: [],
    periodAnalyzed: { start: new Date(), end: new Date() },
    dataQuality: 'insufficient',
    monthsAnalyzed: 0,
    statistics: {
      avgMonthlySpending: 0,
      avgMonthlyIncome: 0,
      spendingStdDev: 0,
      incomeStdDev: 0,
    },
  };
}

/**
 * Convert anomalies to insights
 */
export function convertAnomalyToInsightData(anomaly: Anomaly): {
  type: 'anomaly_spending' | 'anomaly_income';
  title: string;
  message: string;
  data: Record<string, unknown>;
} {
  const type = anomaly.type === 'income' ? 'anomaly_income' : 'anomaly_spending';

  return {
    type,
    title: getAnomalyTitle(anomaly),
    message: anomaly.description,
    data: {
      expected: anomaly.expected,
      actual: anomaly.actual,
      deviation: anomaly.deviation,
      deviationPercent: anomaly.deviationPercent,
      currency: anomaly.currency,
      period: anomaly.affectedPeriod,
      transactionCount: anomaly.relatedTransactions.length,
      ...anomaly.metadata,
    },
  };
}

/**
 * Get a title for the anomaly
 */
function getAnomalyTitle(anomaly: Anomaly): string {
  const direction = anomaly.deviation > 0 ? 'Higher' : 'Lower';

  switch (anomaly.type) {
    case 'spending':
      return `${direction} than usual spending`;
    case 'income':
      return `${direction} than usual income`;
    case 'category':
      return `Unusual category spending`;
    case 'merchant':
      return `Unusual merchant charge`;
    default:
      return 'Financial anomaly detected';
  }
}
