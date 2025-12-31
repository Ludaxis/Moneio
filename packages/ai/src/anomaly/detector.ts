/**
 * Anomaly Detection Engine
 *
 * Detects unusual patterns in transactions:
 * - Duplicate transactions
 * - Spending spikes
 * - Unusual merchants
 * - Velocity anomalies (too many transactions in short time)
 */

/**
 * Anomaly types
 */
export type AnomalyType =
  | 'duplicate'
  | 'spending_spike'
  | 'unusual_merchant'
  | 'velocity_alert'
  | 'pattern_deviation'
  | 'unusual_amount'
  | 'off_hours';

/**
 * Severity levels
 */
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Detected anomaly
 */
export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  transactionId: string;
  details: Record<string, unknown>;
  evidence?: {
    relatedTransactionIds?: string[];
    expectedValue?: number;
    actualValue?: number;
    deviation?: number;
    percentageAboveNormal?: number;
  };
  detectedAt: Date;
}

/**
 * Transaction for anomaly detection
 */
export interface TransactionForAnalysis {
  id: string;
  date: Date;
  description: string;
  amount: number;
  categoryId?: string;
  categoryName?: string;
  merchant?: string;
}

/**
 * Historical transaction data for comparison
 */
export interface TransactionHistory {
  transactions: TransactionForAnalysis[];
  categoryAverages: Map<string, { average: number; stdDev: number; count: number }>;
  merchantHistory: Map<string, { lastSeen: Date; totalSpent: number; count: number }>;
  dailyTotals: Map<string, number>; // YYYY-MM-DD -> total spent
}

/**
 * Anomaly detection configuration
 */
export interface AnomalyConfig {
  /** Alert if spending > X times average for category */
  spendingMultiplierThreshold: number;

  /** Days to look back for duplicate detection */
  duplicateWindowDays: number;

  /** Similarity threshold for duplicate detection (0-1) */
  duplicateSimilarityThreshold: number;

  /** Maximum transactions per hour before velocity alert */
  maxTransactionsPerHour: number;

  /** Maximum daily spending before alert */
  maxDailySpending?: number;

  /** Standard deviations above mean for unusual amount */
  unusualAmountStdDevs: number;

  /** Working hours (transactions outside trigger off_hours) */
  workingHours?: { start: number; end: number };

  /** Minimum transaction amount to analyze (ignore small transactions) */
  minAmountToAnalyze: number;
}

/**
 * Default configuration
 */
export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  spendingMultiplierThreshold: 3.0, // 3x average
  duplicateWindowDays: 7,
  duplicateSimilarityThreshold: 0.85,
  maxTransactionsPerHour: 10,
  unusualAmountStdDevs: 2.5,
  minAmountToAnalyze: 10,
};

/**
 * Anomaly Detector
 */
export class AnomalyDetector {
  private readonly config: AnomalyConfig;

  constructor(config: Partial<AnomalyConfig> = {}) {
    this.config = { ...DEFAULT_ANOMALY_CONFIG, ...config };
  }

  /**
   * Detect all anomalies for a transaction
   */
  async detectAnomalies(
    transaction: TransactionForAnalysis,
    history: TransactionHistory
  ): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Skip small transactions
    if (Math.abs(transaction.amount) < this.config.minAmountToAnalyze) {
      return anomalies;
    }

    // Run all detection algorithms
    const detections = await Promise.all([
      this.detectDuplicate(transaction, history),
      this.detectSpendingSpike(transaction, history),
      this.detectUnusualAmount(transaction, history),
      this.detectVelocityAnomaly(transaction, history),
      this.detectUnusualMerchant(transaction, history),
    ]);

    for (const detection of detections) {
      if (detection) {
        anomalies.push(detection);
      }
    }

    return anomalies;
  }

  /**
   * Detect duplicate transactions
   */
  private async detectDuplicate(
    transaction: TransactionForAnalysis,
    history: TransactionHistory
  ): Promise<Anomaly | null> {
    const windowStart = new Date(transaction.date);
    windowStart.setDate(windowStart.getDate() - this.config.duplicateWindowDays);

    const candidates = history.transactions.filter((tx) => {
      if (tx.id === transaction.id) return false;
      if (tx.date < windowStart) return false;
      if (Math.abs(tx.amount - transaction.amount) > 0.01) return false;
      return true;
    });

    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(transaction.description, candidate.description);

      if (similarity >= this.config.duplicateSimilarityThreshold) {
        return {
          id: crypto.randomUUID(),
          type: 'duplicate',
          severity: 'high',
          message: `Possible duplicate of transaction from ${candidate.date.toISOString().split('T')[0]}`,
          transactionId: transaction.id,
          details: {
            matchedTransactionId: candidate.id,
            matchedDate: candidate.date.toISOString(),
            matchedDescription: candidate.description,
            similarity,
          },
          evidence: {
            relatedTransactionIds: [candidate.id],
          },
          detectedAt: new Date(),
        };
      }
    }

    return null;
  }

  /**
   * Detect spending spikes (way above category average)
   */
  private async detectSpendingSpike(
    transaction: TransactionForAnalysis,
    history: TransactionHistory
  ): Promise<Anomaly | null> {
    if (!transaction.categoryId) return null;

    const categoryStats = history.categoryAverages.get(transaction.categoryId);
    if (!categoryStats || categoryStats.count < 5) return null;

    const absAmount = Math.abs(transaction.amount);
    const multiplier = absAmount / categoryStats.average;

    if (multiplier >= this.config.spendingMultiplierThreshold) {
      const percentageAbove = Math.round((multiplier - 1) * 100);

      return {
        id: crypto.randomUUID(),
        type: 'spending_spike',
        severity: multiplier >= 5 ? 'high' : 'medium',
        message: `${percentageAbove}% above average for ${transaction.categoryName || 'this category'}`,
        transactionId: transaction.id,
        details: {
          categoryId: transaction.categoryId,
          categoryName: transaction.categoryName,
          categoryAverage: categoryStats.average,
          transactionAmount: absAmount,
          multiplier,
        },
        evidence: {
          expectedValue: categoryStats.average,
          actualValue: absAmount,
          percentageAboveNormal: percentageAbove,
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Detect unusual amounts (statistical outlier)
   */
  private async detectUnusualAmount(
    transaction: TransactionForAnalysis,
    history: TransactionHistory
  ): Promise<Anomaly | null> {
    if (!transaction.categoryId) return null;

    const categoryStats = history.categoryAverages.get(transaction.categoryId);
    if (!categoryStats || categoryStats.count < 10 || categoryStats.stdDev === 0) {
      return null;
    }

    const absAmount = Math.abs(transaction.amount);
    const zScore = (absAmount - categoryStats.average) / categoryStats.stdDev;

    if (zScore >= this.config.unusualAmountStdDevs) {
      return {
        id: crypto.randomUUID(),
        type: 'unusual_amount',
        severity: zScore >= 4 ? 'high' : 'medium',
        message: `Unusual amount: ${zScore.toFixed(1)} standard deviations above normal`,
        transactionId: transaction.id,
        details: {
          categoryId: transaction.categoryId,
          zScore,
          mean: categoryStats.average,
          stdDev: categoryStats.stdDev,
        },
        evidence: {
          expectedValue: categoryStats.average,
          actualValue: absAmount,
          deviation: zScore,
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Detect velocity anomalies (too many transactions in short time)
   */
  private async detectVelocityAnomaly(
    transaction: TransactionForAnalysis,
    history: TransactionHistory
  ): Promise<Anomaly | null> {
    const oneHourAgo = new Date(transaction.date.getTime() - 60 * 60 * 1000);

    const recentTransactions = history.transactions.filter(
      (tx) => tx.date >= oneHourAgo && tx.date <= transaction.date && tx.id !== transaction.id
    );

    if (recentTransactions.length >= this.config.maxTransactionsPerHour) {
      return {
        id: crypto.randomUUID(),
        type: 'velocity_alert',
        severity: recentTransactions.length >= 20 ? 'critical' : 'high',
        message: `${recentTransactions.length + 1} transactions in the last hour`,
        transactionId: transaction.id,
        details: {
          transactionCount: recentTransactions.length + 1,
          threshold: this.config.maxTransactionsPerHour,
          timeWindow: '1 hour',
        },
        evidence: {
          relatedTransactionIds: recentTransactions.map((tx) => tx.id),
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Detect unusual/new merchants
   */
  private async detectUnusualMerchant(
    transaction: TransactionForAnalysis,
    history: TransactionHistory
  ): Promise<Anomaly | null> {
    if (!transaction.merchant) return null;

    const merchantStats = history.merchantHistory.get(transaction.merchant);

    // New merchant with large amount
    if (!merchantStats && Math.abs(transaction.amount) > 500) {
      return {
        id: crypto.randomUUID(),
        type: 'unusual_merchant',
        severity: 'medium',
        message: `First transaction with "${transaction.merchant}" for a large amount`,
        transactionId: transaction.id,
        details: {
          merchant: transaction.merchant,
          amount: transaction.amount,
          isNewMerchant: true,
        },
        detectedAt: new Date(),
      };
    }

    // Known merchant but unusual amount (3x normal)
    if (merchantStats && merchantStats.count >= 3) {
      const avgAmount = merchantStats.totalSpent / merchantStats.count;
      if (Math.abs(transaction.amount) > avgAmount * 3) {
        return {
          id: crypto.randomUUID(),
          type: 'unusual_merchant',
          severity: 'medium',
          message: `Unusual amount for "${transaction.merchant}" (${Math.round((Math.abs(transaction.amount) / avgAmount) * 100 - 100)}% above normal)`,
          transactionId: transaction.id,
          details: {
            merchant: transaction.merchant,
            averageAmount: avgAmount,
            thisAmount: Math.abs(transaction.amount),
            previousTransactionCount: merchantStats.count,
          },
          evidence: {
            expectedValue: avgAmount,
            actualValue: Math.abs(transaction.amount),
          },
          detectedAt: new Date(),
        };
      }
    }

    return null;
  }

  /**
   * Calculate text similarity (simple Jaccard index)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const words1 = new Set(normalize(text1));
    const words2 = new Set(normalize(text2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

/**
 * Create anomaly detector with default config
 */
export function createAnomalyDetector(config?: Partial<AnomalyConfig>): AnomalyDetector {
  return new AnomalyDetector(config);
}
