/**
 * Smart Recommendations Engine
 *
 * Analyzes financial data to provide actionable recommendations:
 * - Cost saving opportunities
 * - Revenue growth suggestions
 * - Risk mitigation alerts
 * - Efficiency improvements
 */

import type { MoneyLeak } from '@moneio/domain';
import type { Subscription } from '@moneio/domain';

/**
 * Types of recommendations
 */
export type RecommendationType =
  | 'cost_saving'
  | 'revenue_opportunity'
  | 'risk_mitigation'
  | 'efficiency';

/**
 * Priority levels
 */
export type RecommendationPriority = 'high' | 'medium' | 'low';

/**
 * Action types for recommendations
 */
export type ActionType = 'link' | 'api_call' | 'external' | 'manual';

/**
 * A recommendation action
 */
export interface RecommendationAction {
  type: ActionType;
  label: string;
  target?: string;
}

/**
 * Impact metrics for a recommendation
 */
export interface RecommendationImpact {
  monthly: number;
  annual: number;
  confidence: number; // 0-100
  currency: string;
}

/**
 * A smart recommendation
 */
export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  impact: RecommendationImpact;
  action: RecommendationAction;
  reasoning: string;
  dataPoints: string[];
  category?: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Input data for generating recommendations
 */
export interface RecommendationInput {
  subscriptions: Subscription[];
  moneyLeaks: MoneyLeak[];
  monthlySummary: {
    income: number;
    expenses: number;
    net: number;
  };
  cashBalance: number;
  pendingInvoices: {
    count: number;
    totalAmount: number;
    overdueCount: number;
    overdueAmount: number;
  };
  currency: string;
}

/**
 * Options for generating recommendations
 */
export interface RecommendationOptions {
  /** Maximum number of recommendations to return */
  maxRecommendations?: number;
  /** Minimum confidence to include (0-100) */
  minConfidence?: number;
  /** Filter by recommendation type */
  types?: RecommendationType[];
  /** Filter by minimum priority */
  minPriority?: RecommendationPriority;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<RecommendationOptions> = {
  maxRecommendations: 10,
  minConfidence: 50,
  types: ['cost_saving', 'revenue_opportunity', 'risk_mitigation', 'efficiency'],
  minPriority: 'low',
};

/**
 * Priority order for sorting
 */
const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Generate smart recommendations based on financial data
 */
export function generateRecommendations(
  input: RecommendationInput,
  options?: RecommendationOptions
): Recommendation[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const recommendations: Recommendation[] = [];

  // Generate recommendations from different sources
  recommendations.push(...generateCostSavingRecommendations(input));
  recommendations.push(...generateRevenueRecommendations(input));
  recommendations.push(...generateRiskRecommendations(input));
  recommendations.push(...generateEfficiencyRecommendations(input));

  // Filter by options
  let filtered = recommendations.filter((r) => {
    if (r.impact.confidence < opts.minConfidence) return false;
    if (!opts.types.includes(r.type)) return false;
    if (PRIORITY_ORDER[r.priority] < PRIORITY_ORDER[opts.minPriority]) return false;
    return true;
  });

  // Sort by priority (high first), then by annual impact
  filtered.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.impact.annual - a.impact.annual;
  });

  // Limit results
  return filtered.slice(0, opts.maxRecommendations);
}

/**
 * Generate cost saving recommendations
 */
function generateCostSavingRecommendations(input: RecommendationInput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { subscriptions, moneyLeaks, currency } = input;

  // From money leaks
  for (const leak of moneyLeaks) {
    if (leak.annualImpact <= 0) continue;

    recommendations.push({
      id: `rec_${leak.id}`,
      type: 'cost_saving',
      priority: leak.severity === 'high' ? 'high' : leak.severity === 'medium' ? 'medium' : 'low',
      title: leak.title,
      description: leak.description,
      impact: {
        monthly: leak.monthlyImpact,
        annual: leak.annualImpact,
        confidence: 75,
        currency,
      },
      action: {
        type: 'link',
        label: 'Review',
        target: '/subscriptions?tab=leaks',
      },
      reasoning: leak.recommendation,
      dataPoints: [
        `${leak.affectedTransactions.length} transactions affected`,
        `Potential annual savings: ${currency} ${leak.annualImpact.toFixed(2)}`,
      ],
      createdAt: leak.detectedAt,
    });
  }

  // From flagged subscriptions
  const flaggedSubs = subscriptions.filter((s) => s.flags.length > 0);
  for (const sub of flaggedSubs) {
    for (const flag of sub.flags) {
      if (!flag.potentialSavings || flag.potentialSavings <= 0) continue;

      recommendations.push({
        id: `rec_sub_${sub.id}_${flag.type}`,
        type: 'cost_saving',
        priority: flag.severity === 'alert' ? 'high' : flag.severity === 'warning' ? 'medium' : 'low',
        title: `${sub.merchantName}: ${flag.type.replace('_', ' ')}`,
        description: flag.message,
        impact: {
          monthly: flag.potentialSavings / 12,
          annual: flag.potentialSavings,
          confidence: 70,
          currency,
        },
        action: {
          type: 'link',
          label: 'Review Subscription',
          target: `/subscriptions?subscription=${sub.id}`,
        },
        reasoning: flag.suggestion || 'Review this subscription to save money',
        dataPoints: [
          `Current cost: ${currency} ${sub.monthlyEquivalent.toFixed(2)}/month`,
          `Billed: ${sub.frequency}`,
        ],
        createdAt: flag.detectedAt,
      });
    }
  }

  // High subscription spending
  const totalMonthly = subscriptions.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
  const { expenses } = input.monthlySummary;

  if (expenses > 0 && totalMonthly > expenses * 0.3) {
    recommendations.push({
      id: 'rec_high_subscription_ratio',
      type: 'cost_saving',
      priority: 'medium',
      title: 'High subscription spending ratio',
      description: `Subscriptions account for ${((totalMonthly / expenses) * 100).toFixed(0)}% of your expenses`,
      impact: {
        monthly: totalMonthly * 0.1, // Assume 10% could be saved
        annual: totalMonthly * 0.1 * 12,
        confidence: 60,
        currency,
      },
      action: {
        type: 'link',
        label: 'Audit Subscriptions',
        target: '/subscriptions',
      },
      reasoning: 'Consider auditing your subscriptions to identify services you no longer use',
      dataPoints: [
        `Total subscriptions: ${currency} ${totalMonthly.toFixed(2)}/month`,
        `Total expenses: ${currency} ${expenses.toFixed(2)}/month`,
        `Subscription ratio: ${((totalMonthly / expenses) * 100).toFixed(1)}%`,
      ],
      createdAt: new Date(),
    });
  }

  return recommendations;
}

/**
 * Generate revenue opportunity recommendations
 */
function generateRevenueRecommendations(input: RecommendationInput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { pendingInvoices, currency } = input;

  // Overdue invoices
  if (pendingInvoices.overdueCount > 0) {
    recommendations.push({
      id: 'rec_overdue_invoices',
      type: 'revenue_opportunity',
      priority: pendingInvoices.overdueAmount > 1000 ? 'high' : 'medium',
      title: `${pendingInvoices.overdueCount} overdue invoices`,
      description: `You have ${currency} ${pendingInvoices.overdueAmount.toFixed(2)} in overdue invoices`,
      impact: {
        monthly: 0,
        annual: pendingInvoices.overdueAmount,
        confidence: 90,
        currency,
      },
      action: {
        type: 'link',
        label: 'View Invoices',
        target: '/invoices?status=overdue',
      },
      reasoning: 'Follow up on overdue invoices to improve cash flow',
      dataPoints: [
        `${pendingInvoices.overdueCount} overdue invoices`,
        `Total overdue: ${currency} ${pendingInvoices.overdueAmount.toFixed(2)}`,
      ],
      createdAt: new Date(),
    });
  }

  // Pending invoices
  if (pendingInvoices.count > pendingInvoices.overdueCount && pendingInvoices.totalAmount > 0) {
    const pendingNonOverdue = pendingInvoices.totalAmount - pendingInvoices.overdueAmount;
    recommendations.push({
      id: 'rec_pending_invoices',
      type: 'revenue_opportunity',
      priority: 'low',
      title: `${pendingInvoices.count - pendingInvoices.overdueCount} pending invoices`,
      description: `You have ${currency} ${pendingNonOverdue.toFixed(2)} in pending invoices`,
      impact: {
        monthly: 0,
        annual: pendingNonOverdue,
        confidence: 80,
        currency,
      },
      action: {
        type: 'link',
        label: 'View Invoices',
        target: '/invoices?status=pending',
      },
      reasoning: 'Monitor pending invoices to ensure timely payment',
      dataPoints: [
        `${pendingInvoices.count - pendingInvoices.overdueCount} pending invoices`,
        `Total pending: ${currency} ${pendingNonOverdue.toFixed(2)}`,
      ],
      createdAt: new Date(),
    });
  }

  return recommendations;
}

/**
 * Generate risk mitigation recommendations
 */
function generateRiskRecommendations(input: RecommendationInput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { monthlySummary, cashBalance, currency } = input;

  // Negative cashflow
  if (monthlySummary.net < 0) {
    const monthlyLoss = Math.abs(monthlySummary.net);
    const runwayMonths = cashBalance > 0 ? Math.floor(cashBalance / monthlyLoss) : 0;

    recommendations.push({
      id: 'rec_negative_cashflow',
      type: 'risk_mitigation',
      priority: runwayMonths <= 3 ? 'high' : runwayMonths <= 6 ? 'medium' : 'low',
      title: 'Negative cashflow detected',
      description: `You're spending ${currency} ${monthlyLoss.toFixed(2)} more than you earn monthly`,
      impact: {
        monthly: monthlyLoss,
        annual: monthlyLoss * 12,
        confidence: 85,
        currency,
      },
      action: {
        type: 'link',
        label: 'Review Expenses',
        target: '/insights',
      },
      reasoning:
        runwayMonths <= 6
          ? `At current burn rate, your runway is approximately ${runwayMonths} months`
          : 'Consider reducing expenses or increasing revenue to improve financial health',
      dataPoints: [
        `Monthly income: ${currency} ${monthlySummary.income.toFixed(2)}`,
        `Monthly expenses: ${currency} ${monthlySummary.expenses.toFixed(2)}`,
        `Monthly loss: ${currency} ${monthlyLoss.toFixed(2)}`,
        `Estimated runway: ${runwayMonths} months`,
      ],
      createdAt: new Date(),
    });
  }

  // Low cash balance
  const twoMonthsExpenses = monthlySummary.expenses * 2;
  if (cashBalance < twoMonthsExpenses && cashBalance > 0) {
    recommendations.push({
      id: 'rec_low_cash_balance',
      type: 'risk_mitigation',
      priority: cashBalance < monthlySummary.expenses ? 'high' : 'medium',
      title: 'Low cash reserves',
      description: `Your cash balance covers less than 2 months of expenses`,
      impact: {
        monthly: 0,
        annual: 0,
        confidence: 80,
        currency,
      },
      action: {
        type: 'link',
        label: 'View Cash Flow',
        target: '/dashboard',
      },
      reasoning: 'Build up emergency reserves to cover at least 3-6 months of expenses',
      dataPoints: [
        `Current cash: ${currency} ${cashBalance.toFixed(2)}`,
        `Monthly expenses: ${currency} ${monthlySummary.expenses.toFixed(2)}`,
        `Coverage: ${(cashBalance / monthlySummary.expenses).toFixed(1)} months`,
      ],
      createdAt: new Date(),
    });
  }

  return recommendations;
}

/**
 * Generate efficiency recommendations
 */
function generateEfficiencyRecommendations(input: RecommendationInput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { subscriptions, currency } = input;

  // Multiple similar subscriptions
  const subscriptionGroups = groupSimilarSubscriptions(subscriptions);
  for (const [name, group] of subscriptionGroups) {
    if (group.length > 1) {
      const totalMonthly = group.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
      recommendations.push({
        id: `rec_multiple_${name}`,
        type: 'efficiency',
        priority: 'medium',
        title: `Multiple ${name} subscriptions`,
        description: `You have ${group.length} subscriptions that might be redundant`,
        impact: {
          monthly: totalMonthly / 2, // Assume half could be saved
          annual: (totalMonthly / 2) * 12,
          confidence: 65,
          currency,
        },
        action: {
          type: 'link',
          label: 'Review Subscriptions',
          target: '/subscriptions',
        },
        reasoning: 'Consider consolidating or eliminating redundant subscriptions',
        dataPoints: group.map(
          (s) => `${s.merchantName}: ${currency} ${s.monthlyEquivalent.toFixed(2)}/month`
        ),
        createdAt: new Date(),
      });
    }
  }

  // Unused subscriptions
  const unusedSubs = subscriptions.filter((s) =>
    s.flags.some((f) => f.type === 'unused')
  );
  if (unusedSubs.length > 0) {
    const totalUnused = unusedSubs.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
    recommendations.push({
      id: 'rec_unused_subscriptions',
      type: 'efficiency',
      priority: 'high',
      title: `${unusedSubs.length} potentially unused subscriptions`,
      description: `You may be paying for services you're not actively using`,
      impact: {
        monthly: totalUnused,
        annual: totalUnused * 12,
        confidence: 70,
        currency,
      },
      action: {
        type: 'link',
        label: 'Review Unused Services',
        target: '/subscriptions?filter=unused',
      },
      reasoning: 'Cancel subscriptions you no longer use to save money',
      dataPoints: unusedSubs.map(
        (s) => `${s.merchantName}: ${currency} ${s.monthlyEquivalent.toFixed(2)}/month`
      ),
      createdAt: new Date(),
    });
  }

  return recommendations;
}

/**
 * Group subscriptions by similar names
 */
function groupSimilarSubscriptions(subscriptions: Subscription[]): Map<string, Subscription[]> {
  const groups = new Map<string, Subscription[]>();

  for (const sub of subscriptions) {
    // Normalize name for grouping
    const key = sub.normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 10);

    if (key.length < 3) continue;

    const existing = groups.get(key) || [];
    existing.push(sub);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Get a summary of recommendations
 */
export function getRecommendationsSummary(recommendations: Recommendation[]): {
  totalCount: number;
  byType: Record<RecommendationType, number>;
  byPriority: Record<RecommendationPriority, number>;
  totalPotentialSavings: number;
  currency: string;
} {
  if (recommendations.length === 0) {
    return {
      totalCount: 0,
      byType: {
        cost_saving: 0,
        revenue_opportunity: 0,
        risk_mitigation: 0,
        efficiency: 0,
      },
      byPriority: { high: 0, medium: 0, low: 0 },
      totalPotentialSavings: 0,
      currency: 'EUR',
    };
  }

  const byType: Record<RecommendationType, number> = {
    cost_saving: 0,
    revenue_opportunity: 0,
    risk_mitigation: 0,
    efficiency: 0,
  };

  const byPriority: Record<RecommendationPriority, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalPotentialSavings = 0;

  for (const rec of recommendations) {
    byType[rec.type]++;
    byPriority[rec.priority]++;
    if (rec.type === 'cost_saving' || rec.type === 'efficiency') {
      totalPotentialSavings += rec.impact.annual;
    }
  }

  return {
    totalCount: recommendations.length,
    byType,
    byPriority,
    totalPotentialSavings,
    currency: recommendations[0]?.impact.currency || 'EUR',
  };
}

/**
 * Filter recommendations by type
 */
export function filterRecommendationsByType(
  recommendations: Recommendation[],
  type: RecommendationType
): Recommendation[] {
  return recommendations.filter((r) => r.type === type);
}

/**
 * Filter recommendations by priority
 */
export function filterRecommendationsByPriority(
  recommendations: Recommendation[],
  minPriority: RecommendationPriority
): Recommendation[] {
  const minOrder = PRIORITY_ORDER[minPriority];
  return recommendations.filter((r) => PRIORITY_ORDER[r.priority] >= minOrder);
}
