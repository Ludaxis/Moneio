/**
 * Subscription Tracker Service
 *
 * Tracks and analyzes subscriptions from recurring transaction patterns.
 * Builds on the recurring detector to identify subscriptions and flag
 * potential issues (duplicates, price increases, unused services).
 */

import type { RecurringPattern, RecurringFrequency } from '../transactions/recurring-detector';

/**
 * Subscription status
 */
export type SubscriptionStatus = 'active' | 'cancelled' | 'paused' | 'unknown';

/**
 * Types of flags that can be raised for subscriptions
 */
export type SubscriptionFlagType =
  | 'duplicate'
  | 'price_increase'
  | 'unused'
  | 'expensive'
  | 'better_alternative';

/**
 * Severity levels for subscription flags
 */
export type FlagSeverity = 'info' | 'warning' | 'alert';

/**
 * A flag indicating a potential issue with a subscription
 */
export interface SubscriptionFlag {
  type: SubscriptionFlagType;
  severity: FlagSeverity;
  message: string;
  potentialSavings?: number;
  suggestion?: string;
  detectedAt: Date;
}

/**
 * Price history entry
 */
export interface PriceHistoryEntry {
  date: Date;
  amount: number;
}

/**
 * A tracked subscription
 */
export interface Subscription {
  id: string;
  merchantName: string;
  normalizedName: string;
  amount: number;
  currency: string;
  frequency: RecurringFrequency;
  monthlyEquivalent: number;
  category?: string;
  categoryId?: string;
  firstSeen: Date;
  lastCharge: Date;
  chargeCount: number;
  status: SubscriptionStatus;
  priceHistory: PriceHistoryEntry[];
  flags: SubscriptionFlag[];
  transactionIds: string[];
  confidence: number;
}

/**
 * Summary statistics for subscriptions
 */
export interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  subscriptionCount: number;
  activeCount: number;
  flaggedCount: number;
  potentialSavings: number;
  currency: string;
  byCategory: Array<{ category: string; monthly: number; count: number }>;
  byFrequency: Record<RecurringFrequency, { count: number; monthly: number }>;
}

/**
 * Options for subscription tracking
 */
export interface SubscriptionTrackerOptions {
  /** Minimum confidence to consider as subscription (default: 0.6) */
  minConfidence?: number;
  /** Price increase threshold as percentage (default: 5%) */
  priceIncreaseThresholdPercent?: number;
  /** Days without activity to consider unused (default: 90) */
  unusedThresholdDays?: number;
  /** Monthly amount threshold to flag as expensive (default: 50) */
  expensiveThreshold?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<SubscriptionTrackerOptions> = {
  minConfidence: 0.6,
  priceIncreaseThresholdPercent: 5,
  unusedThresholdDays: 90,
  expensiveThreshold: 50,
};

/**
 * Known service categories for better detection
 */
const SUBSCRIPTION_KEYWORDS = [
  'netflix',
  'spotify',
  'amazon prime',
  'disney+',
  'hbo',
  'apple',
  'google',
  'microsoft',
  'adobe',
  'dropbox',
  'github',
  'slack',
  'zoom',
  'notion',
  'figma',
  'canva',
  'mailchimp',
  'hubspot',
  'salesforce',
  'aws',
  'digitalocean',
  'heroku',
  'vercel',
  'openai',
  'gym',
  'fitness',
  'insurance',
  'subscription',
  'membership',
  'premium',
  'pro plan',
  'monthly',
  'annual',
];

/**
 * Convert recurring patterns to tracked subscriptions
 */
export function trackSubscriptions(
  patterns: RecurringPattern[],
  options?: SubscriptionTrackerOptions
): Subscription[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter for subscription-like patterns
  const subscriptionPatterns = patterns.filter((p) => {
    // Must meet confidence threshold
    if (p.confidence < opts.minConfidence) return false;

    // Must be active
    if (!p.isActive) return false;

    return true;
  });

  // Convert to subscriptions and add flags
  const subscriptions = subscriptionPatterns.map((pattern) => convertToSubscription(pattern, opts));

  // Detect duplicates across all subscriptions
  detectDuplicates(subscriptions);

  // Sort by monthly equivalent (highest first)
  subscriptions.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  return subscriptions;
}

/**
 * Convert a recurring pattern to a subscription
 */
function convertToSubscription(
  pattern: RecurringPattern,
  opts: Required<SubscriptionTrackerOptions>
): Subscription {
  const monthlyEquivalent = normalizeToMonthly(pattern.avgAmount, pattern.frequency);
  const flags: SubscriptionFlag[] = [];

  // Check for expensive subscription
  if (monthlyEquivalent >= opts.expensiveThreshold) {
    flags.push({
      type: 'expensive',
      severity: 'info',
      message: `High monthly cost: ${pattern.currency} ${monthlyEquivalent.toFixed(2)}/month`,
      suggestion:
        'Review if this subscription is still needed or if there are cheaper alternatives',
      detectedAt: new Date(),
    });
  }

  // Determine status based on recency
  const daysSinceLastCharge = Math.round(
    (Date.now() - pattern.lastOccurrence.getTime()) / (1000 * 60 * 60 * 24)
  );

  let status: SubscriptionStatus = 'active';
  if (daysSinceLastCharge > 60) {
    status = 'unknown';
  } else if (daysSinceLastCharge > opts.unusedThresholdDays) {
    status = 'paused';
  }

  // Check if potentially unused (no recent activity)
  if (daysSinceLastCharge > opts.unusedThresholdDays && pattern.transactionCount <= 3) {
    flags.push({
      type: 'unused',
      severity: 'warning',
      message: `No charges in ${daysSinceLastCharge} days - might be forgotten`,
      potentialSavings: monthlyEquivalent * 12,
      suggestion: 'Check if you are still using this service',
      detectedAt: new Date(),
    });
  }

  return {
    id: pattern.id,
    merchantName: pattern.merchantName,
    normalizedName: pattern.normalizedMerchant,
    amount: pattern.avgAmount,
    currency: pattern.currency,
    frequency: pattern.frequency,
    monthlyEquivalent,
    category: pattern.categoryName,
    categoryId: pattern.categoryId,
    firstSeen: getFirstOccurrence(pattern),
    lastCharge: pattern.lastOccurrence,
    chargeCount: pattern.transactionCount,
    status,
    priceHistory: buildPriceHistory(pattern),
    flags,
    transactionIds: pattern.transactionIds,
    confidence: pattern.confidence,
  };
}

/**
 * Detect duplicate subscriptions (same or similar services)
 */
function detectDuplicates(subscriptions: Subscription[]): void {
  const groups = new Map<string, Subscription[]>();

  // Group by similar merchant names
  for (const sub of subscriptions) {
    const key = getServiceKey(sub.normalizedName);
    const existing = groups.get(key) || [];
    existing.push(sub);
    groups.set(key, existing);
  }

  // Flag duplicates
  for (const [_key, group] of groups.entries()) {
    if (group.length > 1) {
      // Sort by amount (keep lowest as primary)
      group.sort((a, b) => a.monthlyEquivalent - b.monthlyEquivalent);

      // Flag all but the cheapest as potential duplicates
      for (let i = 1; i < group.length; i++) {
        const duplicate = group[i];
        const original = group[0];

        duplicate.flags.push({
          type: 'duplicate',
          severity: 'alert',
          message: `Potential duplicate of ${original.merchantName}`,
          potentialSavings: duplicate.monthlyEquivalent * 12,
          suggestion: `Consider cancelling one of these subscriptions`,
          detectedAt: new Date(),
        });
      }
    }
  }
}

/**
 * Check for price increases in a subscription
 */
export function detectPriceIncrease(
  subscription: Subscription,
  transactionAmounts: Array<{ date: Date; amount: number }>,
  thresholdPercent: number = 5
): SubscriptionFlag | null {
  if (transactionAmounts.length < 2) return null;

  // Sort by date
  const sorted = [...transactionAmounts].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compare recent amount to historical average
  const oldAmounts = sorted.slice(0, -3);
  const recentAmounts = sorted.slice(-3);

  if (oldAmounts.length === 0 || recentAmounts.length === 0) return null;

  const oldAvg = oldAmounts.reduce((sum, a) => sum + a.amount, 0) / oldAmounts.length;
  const recentAvg = recentAmounts.reduce((sum, a) => sum + a.amount, 0) / recentAmounts.length;

  const increasePercent = ((recentAvg - oldAvg) / oldAvg) * 100;

  if (increasePercent >= thresholdPercent) {
    const monthlyIncrease = normalizeToMonthly(recentAvg - oldAvg, subscription.frequency);
    return {
      type: 'price_increase',
      severity: increasePercent >= 10 ? 'alert' : 'warning',
      message: `Price increased by ${increasePercent.toFixed(1)}% (from ${subscription.currency} ${oldAvg.toFixed(2)} to ${recentAvg.toFixed(2)})`,
      potentialSavings: monthlyIncrease * 12,
      suggestion: 'Contact the provider about the price increase or look for alternatives',
      detectedAt: new Date(),
    };
  }

  return null;
}

/**
 * Get subscription summary statistics
 */
export function getSubscriptionSummary(subscriptions: Subscription[]): SubscriptionSummary {
  if (subscriptions.length === 0) {
    return {
      totalMonthly: 0,
      totalAnnual: 0,
      subscriptionCount: 0,
      activeCount: 0,
      flaggedCount: 0,
      potentialSavings: 0,
      currency: 'EUR',
      byCategory: [],
      byFrequency: {
        weekly: { count: 0, monthly: 0 },
        biweekly: { count: 0, monthly: 0 },
        monthly: { count: 0, monthly: 0 },
        quarterly: { count: 0, monthly: 0 },
        annual: { count: 0, monthly: 0 },
      },
    };
  }

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const flaggedSubscriptions = subscriptions.filter((s) => s.flags.length > 0);

  // Calculate totals
  let totalMonthly = 0;
  const currencies = new Map<string, number>();
  const categories = new Map<string, { monthly: number; count: number }>();
  const byFrequency: Record<RecurringFrequency, { count: number; monthly: number }> = {
    weekly: { count: 0, monthly: 0 },
    biweekly: { count: 0, monthly: 0 },
    monthly: { count: 0, monthly: 0 },
    quarterly: { count: 0, monthly: 0 },
    annual: { count: 0, monthly: 0 },
  };

  for (const sub of activeSubscriptions) {
    totalMonthly += sub.monthlyEquivalent;

    // Track currency frequency
    const currencyCount = currencies.get(sub.currency) || 0;
    currencies.set(sub.currency, currencyCount + 1);

    // Track by category
    const categoryKey = sub.category || 'Uncategorized';
    const existing = categories.get(categoryKey) || { monthly: 0, count: 0 };
    existing.monthly += sub.monthlyEquivalent;
    existing.count += 1;
    categories.set(categoryKey, existing);

    // Track by frequency
    byFrequency[sub.frequency].count += 1;
    byFrequency[sub.frequency].monthly += sub.monthlyEquivalent;
  }

  // Calculate potential savings from flags
  let potentialSavings = 0;
  for (const sub of subscriptions) {
    for (const flag of sub.flags) {
      if (flag.potentialSavings) {
        potentialSavings += flag.potentialSavings;
      }
    }
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

  // Convert categories map to array
  const byCategory = Array.from(categories.entries())
    .map(([category, data]) => ({
      category,
      monthly: Math.round(data.monthly * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.monthly - a.monthly);

  return {
    totalMonthly: Math.round(totalMonthly * 100) / 100,
    totalAnnual: Math.round(totalMonthly * 12 * 100) / 100,
    subscriptionCount: subscriptions.length,
    activeCount: activeSubscriptions.length,
    flaggedCount: flaggedSubscriptions.length,
    potentialSavings: Math.round(potentialSavings * 100) / 100,
    currency: primaryCurrency,
    byCategory,
    byFrequency,
  };
}

/**
 * Check if a merchant name looks like a subscription service
 */
export function isLikelySubscription(merchantName: string): boolean {
  const normalized = merchantName.toLowerCase();
  return SUBSCRIPTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Helper: Normalize amount to monthly equivalent
 */
function normalizeToMonthly(amount: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'weekly':
      return Math.round(amount * 4.33 * 100) / 100;
    case 'biweekly':
      return Math.round(amount * 2.17 * 100) / 100;
    case 'monthly':
      return Math.round(amount * 100) / 100;
    case 'quarterly':
      return Math.round((amount / 3) * 100) / 100;
    case 'annual':
      return Math.round((amount / 12) * 100) / 100;
  }
}

/**
 * Helper: Get service key for duplicate detection
 */
function getServiceKey(normalizedName: string): string {
  // Remove common suffixes and normalize
  return normalizedName
    .toLowerCase()
    .replace(/\s+(inc|llc|ltd|corp|gmbh|bv)\b/gi, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Helper: Build price history from pattern
 */
function buildPriceHistory(pattern: RecurringPattern): PriceHistoryEntry[] {
  // For now, return current amount as single entry
  // In full implementation, would track historical amounts per transaction
  return [
    {
      date: pattern.lastOccurrence,
      amount: pattern.avgAmount,
    },
  ];
}

/**
 * Helper: Get first occurrence date from pattern
 */
function getFirstOccurrence(pattern: RecurringPattern): Date {
  // Estimate first occurrence based on pattern frequency and count
  const daysPerOccurrence = {
    weekly: 7,
    biweekly: 14,
    monthly: 30,
    quarterly: 91,
    annual: 365,
  };

  const daysSinceFirst = daysPerOccurrence[pattern.frequency] * (pattern.transactionCount - 1);
  const firstOccurrence = new Date(pattern.lastOccurrence);
  firstOccurrence.setDate(firstOccurrence.getDate() - daysSinceFirst);

  return firstOccurrence;
}
