/**
 * Money Leaks Detection Service
 *
 * Analyzes transactions and subscriptions to identify potential money leaks:
 * - Duplicate charges
 * - Bank fees that could be avoided
 * - Forgotten subscriptions
 * - Price creep on recurring payments
 * - Unused services
 */

import type { Subscription, SubscriptionFlag } from '../subscriptions/subscription-tracker';
import type { TransactionInput } from '../transactions/recurring-detector';

/**
 * Types of money leaks
 */
export type MoneyLeakType =
  | 'subscription'
  | 'fee'
  | 'duplicate_charge'
  | 'price_creep'
  | 'unused_service'
  | 'forgotten_subscription';

/**
 * Severity of money leak
 */
export type LeakSeverity = 'low' | 'medium' | 'high';

/**
 * Status of money leak
 */
export type LeakStatus = 'new' | 'acknowledged' | 'resolved' | 'dismissed';

/**
 * A detected money leak
 */
export interface MoneyLeak {
  id: string;
  type: MoneyLeakType;
  severity: LeakSeverity;
  title: string;
  description: string;
  affectedTransactions: string[];
  monthlyImpact: number;
  annualImpact: number;
  currency: string;
  recommendation: string;
  actionable: boolean;
  detectedAt: Date;
  status: LeakStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Summary of money leaks
 */
export interface MoneyLeaksSummary {
  totalLeaks: number;
  newLeaks: number;
  totalPotentialSavings: number;
  currency: string;
  byType: Record<MoneyLeakType, { count: number; savings: number }>;
  bySeverity: Record<LeakSeverity, number>;
  topLeaks: MoneyLeak[];
}

/**
 * Options for money leak detection
 */
export interface MoneyLeakDetectorOptions {
  /** Minimum fee amount to report (default: 1) */
  minFeeAmount?: number;
  /** Days without activity to consider forgotten (default: 60) */
  forgottenThresholdDays?: number;
  /** Price increase percentage to flag (default: 5%) */
  priceIncreaseThreshold?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<MoneyLeakDetectorOptions> = {
  minFeeAmount: 1,
  forgottenThresholdDays: 60,
  priceIncreaseThreshold: 5,
};

/**
 * Fee detection patterns
 */
const FEE_PATTERNS = [
  /\bfee\b/i,
  /\bcharge\b/i,
  /\boverdraft\b/i,
  /\batm\b/i,
  /\bservice\s+charge\b/i,
  /\bmaintenance\b/i,
  /\binterest\s+charge\b/i,
  /\blate\s+fee\b/i,
  /\bpenalty\b/i,
  /\bforeign\s+transaction\b/i,
  /\bcurrency\s+conversion\b/i,
];

/**
 * Detect all money leaks from transactions and subscriptions
 */
export function detectMoneyLeaks(
  transactions: TransactionInput[],
  subscriptions: Subscription[],
  options?: MoneyLeakDetectorOptions
): MoneyLeak[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const leaks: MoneyLeak[] = [];

  // 1. Detect subscription-based leaks
  const subscriptionLeaks = detectSubscriptionLeaks(subscriptions);
  leaks.push(...subscriptionLeaks);

  // 2. Detect bank fees
  const feeLeaks = detectBankFees(transactions, opts);
  leaks.push(...feeLeaks);

  // 3. Detect duplicate charges (same merchant, same amount, within days)
  const duplicateLeaks = detectDuplicateCharges(transactions);
  leaks.push(...duplicateLeaks);

  // Sort by annual impact (highest first)
  leaks.sort((a, b) => b.annualImpact - a.annualImpact);

  return leaks;
}

/**
 * Detect leaks from subscription flags
 */
function detectSubscriptionLeaks(subscriptions: Subscription[]): MoneyLeak[] {
  const leaks: MoneyLeak[] = [];

  for (const sub of subscriptions) {
    for (const flag of sub.flags) {
      const leak = convertFlagToLeak(sub, flag);
      if (leak) {
        leaks.push(leak);
      }
    }
  }

  return leaks;
}

/**
 * Convert subscription flag to money leak
 */
function convertFlagToLeak(subscription: Subscription, flag: SubscriptionFlag): MoneyLeak | null {
  const monthlyImpact = flag.potentialSavings
    ? flag.potentialSavings / 12
    : subscription.monthlyEquivalent;
  const annualImpact = flag.potentialSavings || subscription.monthlyEquivalent * 12;

  let type: MoneyLeakType;
  let severity: LeakSeverity;

  switch (flag.type) {
    case 'duplicate':
      type = 'subscription';
      severity = 'high';
      break;
    case 'price_increase':
      type = 'price_creep';
      severity = flag.severity === 'alert' ? 'high' : 'medium';
      break;
    case 'unused':
      type = 'unused_service';
      severity = 'medium';
      break;
    case 'expensive':
      type = 'subscription';
      severity = 'low';
      break;
    default:
      return null;
  }

  return {
    id: `leak_${subscription.id}_${flag.type}`,
    type,
    severity,
    title: `${subscription.merchantName}: ${flag.type.replace('_', ' ')}`,
    description: flag.message,
    affectedTransactions: subscription.transactionIds,
    monthlyImpact,
    annualImpact,
    currency: subscription.currency,
    recommendation: flag.suggestion || 'Review this subscription',
    actionable: true,
    detectedAt: flag.detectedAt,
    status: 'new',
    metadata: {
      subscriptionId: subscription.id,
      flagType: flag.type,
    },
  };
}

/**
 * Detect bank fees from transactions
 */
function detectBankFees(
  transactions: TransactionInput[],
  opts: Required<MoneyLeakDetectorOptions>
): MoneyLeak[] {
  const leaks: MoneyLeak[] = [];
  const feeTransactions: TransactionInput[] = [];
  let totalFees = 0;
  let currency = 'EUR';

  for (const tx of transactions) {
    if (!tx.description) continue;

    const isFee = FEE_PATTERNS.some((pattern) => pattern.test(tx.description!));
    if (!isFee) continue;

    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    const absAmount = Math.abs(amount);

    if (absAmount < opts.minFeeAmount) continue;

    feeTransactions.push(tx);
    totalFees += absAmount;
    currency = tx.currency;
  }

  // Only create a leak if there are meaningful fees
  if (feeTransactions.length > 0 && totalFees > opts.minFeeAmount) {
    // Calculate monthly average
    const dates = feeTransactions.map((tx) => tx.postedAt);
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const months = Math.max(
      1,
      (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    const monthlyFees = totalFees / months;

    leaks.push({
      id: `leak_bank_fees_${Date.now()}`,
      type: 'fee',
      severity: monthlyFees > 20 ? 'high' : monthlyFees > 10 ? 'medium' : 'low',
      title: 'Bank Fees Detected',
      description: `You've paid ${currency} ${totalFees.toFixed(2)} in bank fees (${feeTransactions.length} transactions)`,
      affectedTransactions: feeTransactions.map((tx) => tx.id),
      monthlyImpact: Math.round(monthlyFees * 100) / 100,
      annualImpact: Math.round(monthlyFees * 12 * 100) / 100,
      currency,
      recommendation:
        'Consider switching to a fee-free bank account or negotiating fee waivers with your current bank',
      actionable: true,
      detectedAt: new Date(),
      status: 'new',
      metadata: {
        feeCount: feeTransactions.length,
        totalFees,
      },
    });
  }

  return leaks;
}

/**
 * Detect duplicate charges (same merchant, same amount, within short period)
 */
function detectDuplicateCharges(transactions: TransactionInput[]): MoneyLeak[] {
  const leaks: MoneyLeak[] = [];
  const seen = new Map<string, TransactionInput[]>();

  // Group by merchant+amount+week
  for (const tx of transactions) {
    if (!tx.description) continue;

    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    const weekNumber = getWeekNumber(tx.postedAt);
    const key = `${tx.description.toLowerCase()}_${Math.abs(amount).toFixed(2)}_${weekNumber}`;

    const existing = seen.get(key) || [];
    existing.push(tx);
    seen.set(key, existing);
  }

  // Find duplicates (more than 1 transaction in same week with same amount)
  for (const [_key, txs] of seen.entries()) {
    if (txs.length <= 1) continue;

    // Skip if this looks intentional (different days)
    const dates = txs.map((tx) => tx.postedAt.toDateString());
    const uniqueDates = new Set(dates);
    if (uniqueDates.size === txs.length) continue;

    const amount = typeof txs[0].amount === 'number' ? txs[0].amount : txs[0].amount.toNumber();
    const totalDuplicate = Math.abs(amount) * (txs.length - 1);

    leaks.push({
      id: `leak_duplicate_${txs[0].id}`,
      type: 'duplicate_charge',
      severity: totalDuplicate > 50 ? 'high' : totalDuplicate > 20 ? 'medium' : 'low',
      title: `Possible Duplicate Charge: ${txs[0].description}`,
      description: `${txs.length} identical charges of ${txs[0].currency} ${Math.abs(amount).toFixed(2)} detected`,
      affectedTransactions: txs.map((tx) => tx.id),
      monthlyImpact: 0, // One-time duplicate
      annualImpact: totalDuplicate,
      currency: txs[0].currency,
      recommendation: 'Review these charges and contact the merchant if they are duplicates',
      actionable: true,
      detectedAt: new Date(),
      status: 'new',
      metadata: {
        chargeCount: txs.length,
        duplicateAmount: totalDuplicate,
      },
    });
  }

  return leaks;
}

/**
 * Get money leaks summary
 */
export function getMoneyLeaksSummary(leaks: MoneyLeak[]): MoneyLeaksSummary {
  if (leaks.length === 0) {
    return {
      totalLeaks: 0,
      newLeaks: 0,
      totalPotentialSavings: 0,
      currency: 'EUR',
      byType: {
        subscription: { count: 0, savings: 0 },
        fee: { count: 0, savings: 0 },
        duplicate_charge: { count: 0, savings: 0 },
        price_creep: { count: 0, savings: 0 },
        unused_service: { count: 0, savings: 0 },
        forgotten_subscription: { count: 0, savings: 0 },
      },
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
      },
      topLeaks: [],
    };
  }

  let totalPotentialSavings = 0;
  const currencies = new Map<string, number>();
  const byType: Record<MoneyLeakType, { count: number; savings: number }> = {
    subscription: { count: 0, savings: 0 },
    fee: { count: 0, savings: 0 },
    duplicate_charge: { count: 0, savings: 0 },
    price_creep: { count: 0, savings: 0 },
    unused_service: { count: 0, savings: 0 },
    forgotten_subscription: { count: 0, savings: 0 },
  };
  const bySeverity: Record<LeakSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  for (const leak of leaks) {
    totalPotentialSavings += leak.annualImpact;

    byType[leak.type].count += 1;
    byType[leak.type].savings += leak.annualImpact;

    bySeverity[leak.severity] += 1;

    const currencyCount = currencies.get(leak.currency) || 0;
    currencies.set(leak.currency, currencyCount + 1);
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

  // Get top 5 leaks by impact
  const topLeaks = [...leaks].sort((a, b) => b.annualImpact - a.annualImpact).slice(0, 5);

  return {
    totalLeaks: leaks.length,
    newLeaks: leaks.filter((l) => l.status === 'new').length,
    totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100,
    currency: primaryCurrency,
    byType,
    bySeverity,
    topLeaks,
  };
}

/**
 * Filter leaks by status
 */
export function filterLeaksByStatus(leaks: MoneyLeak[], status: LeakStatus): MoneyLeak[] {
  return leaks.filter((leak) => leak.status === status);
}

/**
 * Filter leaks by type
 */
export function filterLeaksByType(leaks: MoneyLeak[], type: MoneyLeakType): MoneyLeak[] {
  return leaks.filter((leak) => leak.type === type);
}

/**
 * Filter leaks by minimum severity
 */
export function filterLeaksBySeverity(leaks: MoneyLeak[], minSeverity: LeakSeverity): MoneyLeak[] {
  const severityOrder: Record<LeakSeverity, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const minOrder = severityOrder[minSeverity];
  return leaks.filter((leak) => severityOrder[leak.severity] >= minOrder);
}

/**
 * Get week number for date (for duplicate detection)
 */
function getWeekNumber(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${week}`;
}

/**
 * Analyze spending for potential anomalies
 */
export function analyzeSpendingAnomalies(
  transactions: TransactionInput[],
  _lookbackMonths: number = 6
): {
  anomalies: Array<{
    description: string;
    amount: number;
    expected: number;
    deviation: number;
    severity: LeakSeverity;
  }>;
} {
  // Group expenses by month
  const monthlyExpenses = new Map<string, number>();

  for (const tx of transactions) {
    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    if (amount >= 0) continue; // Only expenses (negative amounts)

    const monthKey = `${tx.postedAt.getFullYear()}-${String(tx.postedAt.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthlyExpenses.get(monthKey) || 0;
    monthlyExpenses.set(monthKey, existing + Math.abs(amount));
  }

  // Calculate average and standard deviation
  const values = Array.from(monthlyExpenses.values());
  if (values.length < 3) {
    return { anomalies: [] };
  }

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length
  );

  // Find anomalies (months that deviate significantly)
  const anomalies: Array<{
    description: string;
    amount: number;
    expected: number;
    deviation: number;
    severity: LeakSeverity;
  }> = [];

  for (const [month, amount] of monthlyExpenses.entries()) {
    const deviation = (amount - avg) / stdDev;
    if (Math.abs(deviation) > 1.5) {
      anomalies.push({
        description: `${month}: Spending ${deviation > 0 ? 'above' : 'below'} average`,
        amount,
        expected: avg,
        deviation: Math.round(deviation * 100) / 100,
        severity: Math.abs(deviation) > 2.5 ? 'high' : Math.abs(deviation) > 2 ? 'medium' : 'low',
      });
    }
  }

  return { anomalies };
}
