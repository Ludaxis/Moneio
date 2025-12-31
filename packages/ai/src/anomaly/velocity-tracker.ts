/**
 * Spending Velocity Tracker
 *
 * Tracks spending patterns over time to detect:
 * - Unusual spending velocity (rate of spending)
 * - Budget burndown anomalies
 * - Category spending trends
 */

/**
 * Velocity alert types
 */
export type VelocityAlertType =
  | 'daily_limit_exceeded'
  | 'weekly_limit_exceeded'
  | 'category_budget_exceeded'
  | 'unusual_velocity'
  | 'rapid_spending';

/**
 * Velocity alert
 */
export interface VelocityAlert {
  id: string;
  type: VelocityAlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: {
    currentSpending: number;
    limit?: number;
    percentOfLimit?: number;
    timeWindow: string;
    categoryId?: string;
    categoryName?: string;
  };
  triggeredAt: Date;
}

/**
 * Spending bucket for tracking
 */
interface SpendingBucket {
  total: number;
  count: number;
  lastUpdated: Date;
}

/**
 * Velocity configuration
 */
export interface VelocityConfig {
  /** Daily spending limit (optional) */
  dailyLimit?: number;

  /** Weekly spending limit (optional) */
  weeklyLimit?: number;

  /** Category-specific budgets */
  categoryBudgets?: Map<string, { daily?: number; weekly?: number; monthly?: number }>;

  /** Alert when spending rate increases by this factor */
  velocityIncreaseThreshold: number;

  /** Minimum transactions before velocity alerts */
  minTransactionsForVelocity: number;

  /** Time window for velocity calculation (hours) */
  velocityWindowHours: number;
}

/**
 * Default velocity configuration
 */
export const DEFAULT_VELOCITY_CONFIG: VelocityConfig = {
  velocityIncreaseThreshold: 2.0, // 2x normal velocity
  minTransactionsForVelocity: 5,
  velocityWindowHours: 24,
};

/**
 * Velocity Tracker
 */
export class VelocityTracker {
  private readonly config: VelocityConfig;

  // In-memory tracking (in production, would use Redis)
  private dailySpending: Map<string, SpendingBucket> = new Map(); // workspaceId:YYYY-MM-DD -> bucket
  private weeklySpending: Map<string, SpendingBucket> = new Map(); // workspaceId:YYYY-Www -> bucket
  private categorySpending: Map<string, SpendingBucket> = new Map(); // workspaceId:categoryId:period -> bucket
  private velocityHistory: Map<string, number[]> = new Map(); // workspaceId -> spending per hour

  constructor(config: Partial<VelocityConfig> = {}) {
    this.config = { ...DEFAULT_VELOCITY_CONFIG, ...config };
  }

  /**
   * Track a transaction and check for velocity alerts
   */
  trackTransaction(
    workspaceId: string,
    transaction: {
      id: string;
      amount: number;
      date: Date;
      categoryId?: string;
      categoryName?: string;
    }
  ): VelocityAlert[] {
    const alerts: VelocityAlert[] = [];
    const absAmount = Math.abs(transaction.amount);

    // Only track expenses (negative amounts)
    if (transaction.amount >= 0) {
      return alerts;
    }

    // Update daily spending
    const dailyKey = this.getDailyKey(workspaceId, transaction.date);
    const dailyBucket = this.updateBucket(this.dailySpending, dailyKey, absAmount);

    // Check daily limit
    if (this.config.dailyLimit && dailyBucket.total > this.config.dailyLimit) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'daily_limit_exceeded',
        severity: dailyBucket.total > this.config.dailyLimit * 1.5 ? 'high' : 'medium',
        message: `Daily spending limit exceeded: ${dailyBucket.total.toFixed(2)} / ${this.config.dailyLimit}`,
        details: {
          currentSpending: dailyBucket.total,
          limit: this.config.dailyLimit,
          percentOfLimit: (dailyBucket.total / this.config.dailyLimit) * 100,
          timeWindow: 'daily',
        },
        triggeredAt: new Date(),
      });
    }

    // Update weekly spending
    const weeklyKey = this.getWeeklyKey(workspaceId, transaction.date);
    const weeklyBucket = this.updateBucket(this.weeklySpending, weeklyKey, absAmount);

    // Check weekly limit
    if (this.config.weeklyLimit && weeklyBucket.total > this.config.weeklyLimit) {
      alerts.push({
        id: crypto.randomUUID(),
        type: 'weekly_limit_exceeded',
        severity: weeklyBucket.total > this.config.weeklyLimit * 1.5 ? 'high' : 'medium',
        message: `Weekly spending limit exceeded: ${weeklyBucket.total.toFixed(2)} / ${this.config.weeklyLimit}`,
        details: {
          currentSpending: weeklyBucket.total,
          limit: this.config.weeklyLimit,
          percentOfLimit: (weeklyBucket.total / this.config.weeklyLimit) * 100,
          timeWindow: 'weekly',
        },
        triggeredAt: new Date(),
      });
    }

    // Check category budget
    if (transaction.categoryId && this.config.categoryBudgets) {
      const categoryBudget = this.config.categoryBudgets.get(transaction.categoryId);
      if (categoryBudget?.daily) {
        const categoryDailyKey = `${dailyKey}:${transaction.categoryId}`;
        const categoryBucket = this.updateBucket(
          this.categorySpending,
          categoryDailyKey,
          absAmount
        );

        if (categoryBucket.total > categoryBudget.daily) {
          alerts.push({
            id: crypto.randomUUID(),
            type: 'category_budget_exceeded',
            severity: 'medium',
            message: `${transaction.categoryName || 'Category'} daily budget exceeded`,
            details: {
              currentSpending: categoryBucket.total,
              limit: categoryBudget.daily,
              percentOfLimit: (categoryBucket.total / categoryBudget.daily) * 100,
              timeWindow: 'daily',
              categoryId: transaction.categoryId,
              categoryName: transaction.categoryName,
            },
            triggeredAt: new Date(),
          });
        }
      }
    }

    // Check velocity (spending rate)
    const velocityAlert = this.checkVelocity(workspaceId, absAmount);
    if (velocityAlert) {
      alerts.push(velocityAlert);
    }

    return alerts;
  }

  /**
   * Check for unusual spending velocity
   */
  private checkVelocity(workspaceId: string, amount: number): VelocityAlert | null {
    const history = this.velocityHistory.get(workspaceId) || [];

    // Add current hour's spending
    const currentHourIndex = new Date().getHours();
    while (history.length <= currentHourIndex) {
      history.push(0);
    }
    history[currentHourIndex] += amount;
    this.velocityHistory.set(workspaceId, history);

    // Need enough history
    const nonZeroHours = history.filter((h) => h > 0).length;
    if (nonZeroHours < this.config.minTransactionsForVelocity) {
      return null;
    }

    // Calculate average velocity (spending per hour)
    const totalSpending = history.reduce((a, b) => a + b, 0);
    const avgVelocity = totalSpending / nonZeroHours;

    // Current hour's velocity
    const currentVelocity = history[currentHourIndex];

    // Check if current velocity is unusually high
    if (currentVelocity > avgVelocity * this.config.velocityIncreaseThreshold) {
      const velocityIncrease = currentVelocity / avgVelocity;

      return {
        id: crypto.randomUUID(),
        type: 'unusual_velocity',
        severity: velocityIncrease > 3 ? 'high' : 'medium',
        message: `Spending velocity ${velocityIncrease.toFixed(1)}x higher than normal`,
        details: {
          currentSpending: currentVelocity,
          limit: avgVelocity * this.config.velocityIncreaseThreshold,
          percentOfLimit: velocityIncrease * 100,
          timeWindow: 'hourly',
        },
        triggeredAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Update a spending bucket
   */
  private updateBucket(
    map: Map<string, SpendingBucket>,
    key: string,
    amount: number
  ): SpendingBucket {
    const existing = map.get(key) || { total: 0, count: 0, lastUpdated: new Date() };
    existing.total += amount;
    existing.count += 1;
    existing.lastUpdated = new Date();
    map.set(key, existing);
    return existing;
  }

  /**
   * Get daily key for a workspace and date
   */
  private getDailyKey(workspaceId: string, date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    return `${workspaceId}:${dateStr}`;
  }

  /**
   * Get weekly key for a workspace and date
   */
  private getWeeklyKey(workspaceId: string, date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${workspaceId}:${year}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * Get ISO week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Get spending summary for a workspace
   */
  getSpendingSummary(workspaceId: string): {
    today: number;
    thisWeek: number;
    transactionsToday: number;
  } {
    const today = new Date();
    const dailyKey = this.getDailyKey(workspaceId, today);
    const weeklyKey = this.getWeeklyKey(workspaceId, today);

    const dailyBucket = this.dailySpending.get(dailyKey);
    const weeklyBucket = this.weeklySpending.get(weeklyKey);

    return {
      today: dailyBucket?.total || 0,
      thisWeek: weeklyBucket?.total || 0,
      transactionsToday: dailyBucket?.count || 0,
    };
  }

  /**
   * Reset tracking (for testing)
   */
  reset(): void {
    this.dailySpending.clear();
    this.weeklySpending.clear();
    this.categorySpending.clear();
    this.velocityHistory.clear();
  }
}

/**
 * Create velocity tracker
 */
export function createVelocityTracker(config?: Partial<VelocityConfig>): VelocityTracker {
  return new VelocityTracker(config);
}
