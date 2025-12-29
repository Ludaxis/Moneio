/**
 * Recurring Transaction Detection Service
 *
 * Detects recurring patterns in bank transactions (subscriptions, bills, regular payments)
 * using frequency analysis, amount consistency, and temporal patterns.
 */

import { getMerchantKey } from '@moneio/core-ledger';

/**
 * Detected frequency of recurring transactions
 */
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

/**
 * A detected recurring transaction pattern
 */
export interface RecurringPattern {
  /** Unique ID derived from normalized merchant */
  id: string;
  /** Original merchant name (most common form seen) */
  merchantName: string;
  /** Normalized merchant key for grouping */
  normalizedMerchant: string;
  /** Detected frequency */
  frequency: RecurringFrequency;
  /** Average transaction amount (absolute value) */
  avgAmount: number;
  /** Standard deviation of amounts */
  amountVariance: number;
  /** Currency code */
  currency: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Date of most recent occurrence */
  lastOccurrence: Date;
  /** Predicted next occurrence */
  nextExpected: Date;
  /** IDs of transactions that match this pattern */
  transactionIds: string[];
  /** Total number of matching transactions */
  transactionCount: number;
  /** Whether the pattern is currently active (recent transactions) */
  isActive: boolean;
  /** Category info if transactions are categorized */
  categoryId?: string;
  categoryName?: string;
}

/**
 * Options for recurring detection
 */
export interface RecurringDetectorOptions {
  /** Minimum occurrences to consider as recurring (default: 3) */
  minOccurrences?: number;
  /** Amount variance tolerance as percentage (default: 15%) */
  amountTolerancePercent?: number;
  /** Days of tolerance for interval detection (default: 5) */
  intervalToleranceDays?: number;
  /** How many months back to analyze (default: 12) */
  lookbackMonths?: number;
  /** Minimum confidence to include in results (default: 0.5) */
  minConfidence?: number;
}

/**
 * Summary of recurring patterns
 */
export interface RecurringSummary {
  /** Total number of recurring patterns detected */
  totalPatterns: number;
  /** Number of active patterns */
  activePatterns: number;
  /** Total monthly amount of all recurring transactions */
  monthlyTotal: number;
  /** Primary currency */
  currency: string;
}

/**
 * Input transaction format (compatible with Prisma BankTransaction)
 */
export interface TransactionInput {
  id: string;
  postedAt: Date;
  description: string | null;
  amount: number | { toNumber(): number };
  currency: string;
  // Optional categorization info
  categorizations?: Array<{
    category?: { id: string; name: string } | null;
  }>;
}

/**
 * Internal grouped transaction for analysis
 */
interface GroupedTransaction {
  id: string;
  postedAt: Date;
  amount: number;
  categoryId?: string;
  categoryName?: string;
}

/**
 * Frequency configuration
 */
const FREQUENCY_RANGES: Record<RecurringFrequency, { min: number; max: number; days: number }> = {
  weekly: { min: 5, max: 10, days: 7 },
  biweekly: { min: 12, max: 17, days: 14 },
  monthly: { min: 26, max: 35, days: 30 },
  quarterly: { min: 85, max: 100, days: 91 },
  annual: { min: 350, max: 380, days: 365 },
};

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<RecurringDetectorOptions> = {
  minOccurrences: 3,
  amountTolerancePercent: 15,
  intervalToleranceDays: 5,
  lookbackMonths: 12,
  minConfidence: 0.5,
};

/**
 * Detect recurring transaction patterns
 */
export function detectRecurringPatterns(
  transactions: TransactionInput[],
  options?: RecurringDetectorOptions
): RecurringPattern[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter to lookback period
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - opts.lookbackMonths);

  const filtered = transactions.filter((tx) => tx.postedAt >= cutoffDate);

  // Group by normalized merchant
  const groups = groupByMerchant(filtered);

  // Analyze each group for recurring patterns
  const patterns: RecurringPattern[] = [];

  for (const [normalizedMerchant, txs] of groups.entries()) {
    if (txs.length < opts.minOccurrences) continue;

    const pattern = analyzeGroup(normalizedMerchant, txs, opts);
    if (pattern && pattern.confidence >= opts.minConfidence) {
      patterns.push(pattern);
    }
  }

  // Sort by confidence (highest first)
  patterns.sort((a, b) => b.confidence - a.confidence);

  return patterns;
}

/**
 * Get summary statistics for recurring patterns
 */
export function getRecurringSummary(patterns: RecurringPattern[]): RecurringSummary {
  if (patterns.length === 0) {
    return {
      totalPatterns: 0,
      activePatterns: 0,
      monthlyTotal: 0,
      currency: 'EUR',
    };
  }

  const activePatterns = patterns.filter((p) => p.isActive);

  // Calculate monthly total by normalizing all frequencies to monthly
  let monthlyTotal = 0;
  const currencies = new Map<string, number>();

  for (const pattern of activePatterns) {
    const monthlyAmount = normalizeToMonthly(pattern.avgAmount, pattern.frequency);
    monthlyTotal += monthlyAmount;

    const currencyCount = currencies.get(pattern.currency) || 0;
    currencies.set(pattern.currency, currencyCount + 1);
  }

  // Find most common currency
  let primaryCurrency = 'EUR';
  let maxCount = 0;
  for (const [currency, count] of currencies.entries()) {
    if (count > maxCount) {
      maxCount = count;
      primaryCurrency = currency;
    }
  }

  return {
    totalPatterns: patterns.length,
    activePatterns: activePatterns.length,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    currency: primaryCurrency,
  };
}

/**
 * Group transactions by normalized merchant name
 */
function groupByMerchant(transactions: TransactionInput[]): Map<string, GroupedTransaction[]> {
  const groups = new Map<string, GroupedTransaction[]>();

  for (const tx of transactions) {
    if (!tx.description) continue;

    const normalizedMerchant = getMerchantKey(tx.description);
    if (!normalizedMerchant) continue;

    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();

    // Get category from first approved categorization
    const categorization = tx.categorizations?.find((c) => c.category);
    const categoryId = categorization?.category?.id;
    const categoryName = categorization?.category?.name;

    const grouped: GroupedTransaction = {
      id: tx.id,
      postedAt: tx.postedAt,
      amount: Math.abs(amount), // Use absolute value for comparison
      categoryId,
      categoryName,
    };

    const existing = groups.get(normalizedMerchant) || [];
    existing.push(grouped);
    groups.set(normalizedMerchant, existing);
  }

  return groups;
}

/**
 * Analyze a group of transactions for recurring patterns
 */
function analyzeGroup(
  normalizedMerchant: string,
  transactions: GroupedTransaction[],
  opts: Required<RecurringDetectorOptions>
): RecurringPattern | null {
  // Sort by date
  const sorted = [...transactions].sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());

  // Calculate intervals between consecutive transactions
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.round(
      (sorted[i].postedAt.getTime() - sorted[i - 1].postedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    intervals.push(days);
  }

  if (intervals.length === 0) return null;

  // Detect frequency
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const frequency = detectFrequency(avgInterval, opts.intervalToleranceDays);
  if (!frequency) return null;

  // Calculate amount statistics
  const amounts = sorted.map((t) => t.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const amountVariance = calculateStdDev(amounts);

  // Check amount consistency
  const amountTolerance = avgAmount * (opts.amountTolerancePercent / 100);
  if (amountVariance > amountTolerance) return null;

  // Calculate confidence
  const confidence = calculateConfidence(intervals, amounts, sorted, frequency);

  // Calculate next expected date
  const lastOccurrence = sorted[sorted.length - 1].postedAt;
  const nextExpected = new Date(lastOccurrence);
  nextExpected.setDate(nextExpected.getDate() + FREQUENCY_RANGES[frequency].days);

  // Determine if active (had a transaction in the last 45 days)
  const daysSinceLastOccurrence = Math.round(
    (Date.now() - lastOccurrence.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isActive = daysSinceLastOccurrence < 45;

  // Get most common category
  const categoryId = getMostCommon(sorted.map((t) => t.categoryId).filter(Boolean) as string[]);
  const categoryName = sorted.find((t) => t.categoryId === categoryId)?.categoryName;

  // Get currency from first transaction (assuming consistent currency within group)
  const currency = 'EUR'; // Default - actual currency should come from transaction

  return {
    id: generatePatternId(normalizedMerchant),
    merchantName: capitalizeWords(normalizedMerchant),
    normalizedMerchant,
    frequency,
    avgAmount: Math.round(avgAmount * 100) / 100,
    amountVariance: Math.round(amountVariance * 100) / 100,
    currency,
    confidence: Math.round(confidence * 100) / 100,
    lastOccurrence,
    nextExpected,
    transactionIds: sorted.map((t) => t.id),
    transactionCount: sorted.length,
    isActive,
    categoryId,
    categoryName,
  };
}

/**
 * Detect frequency from average interval
 */
function detectFrequency(avgInterval: number, tolerance: number): RecurringFrequency | null {
  for (const [freq, range] of Object.entries(FREQUENCY_RANGES)) {
    if (avgInterval >= range.min - tolerance && avgInterval <= range.max + tolerance) {
      return freq as RecurringFrequency;
    }
  }
  return null;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  intervals: number[],
  amounts: number[],
  transactions: GroupedTransaction[],
  frequency: RecurringFrequency
): number {
  const expectedInterval = FREQUENCY_RANGES[frequency].days;

  // Interval consistency (35%)
  const intervalStdDev = calculateStdDev(intervals);
  const intervalConsistency = Math.max(0, 1 - intervalStdDev / expectedInterval);

  // Amount consistency (25%)
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const amountStdDev = calculateStdDev(amounts);
  const amountConsistency = avgAmount > 0 ? Math.max(0, 1 - amountStdDev / avgAmount) : 0;

  // Recency score (25%)
  const lastOccurrence = transactions[transactions.length - 1].postedAt;
  const daysSince = Math.round((Date.now() - lastOccurrence.getTime()) / (1000 * 60 * 60 * 24));
  const recencyScore = daysSince < 45 ? 1 : Math.max(0, (90 - daysSince) / 90);

  // Sample size score (15%)
  const sampleSizeScore = Math.min(transactions.length / 6, 1);

  return (
    intervalConsistency * 0.35 +
    amountConsistency * 0.25 +
    recencyScore * 0.25 +
    sampleSizeScore * 0.15
  );
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Normalize amount to monthly equivalent
 */
function normalizeToMonthly(amount: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'weekly':
      return amount * 4.33; // ~4.33 weeks per month
    case 'biweekly':
      return amount * 2.17;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'annual':
      return amount / 12;
  }
}

/**
 * Get most common value from array
 */
function getMostCommon<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;

  const counts = new Map<T, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon: T | undefined;
  for (const [value, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = value;
    }
  }

  return mostCommon;
}

/**
 * Generate a stable pattern ID from normalized merchant
 */
function generatePatternId(normalizedMerchant: string): string {
  // Simple hash - could use crypto.createHash in production
  let hash = 0;
  for (let i = 0; i < normalizedMerchant.length; i++) {
    const char = normalizedMerchant.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `rec_${Math.abs(hash).toString(16)}`;
}

/**
 * Capitalize words for display
 */
function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
