/**
 * Weekly Digest Service
 *
 * Generates a weekly summary of financial activity including:
 * - Income and expense totals
 * - Week-over-week comparisons
 * - Notable highlights
 * - Action items
 * - Cash flow forecast
 */

import type { Subscription } from '../subscriptions/subscription-tracker';
import type { TransactionInput } from '../transactions/recurring-detector';

import type { Insight } from './insight-types';

/**
 * Highlight item in the digest
 */
export interface DigestHighlight {
  type: 'positive' | 'negative' | 'neutral';
  title: string;
  description: string;
  amount?: number;
  currency?: string;
}

/**
 * Action item in the digest
 */
export interface DigestActionItem {
  title: string;
  description: string;
  url: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Cash flow status
 */
export type CashFlowStatus = 'healthy' | 'warning' | 'critical';

/**
 * Input for generating weekly digest
 */
export interface WeeklyDigestInput {
  workspaceId: string;
  transactions: TransactionInput[];
  subscriptions: Subscription[];
  insights: Insight[];
  previousWeekData?: {
    totalIncome: number;
    totalExpenses: number;
    netCashflow: number;
  };
  currency?: string;
}

/**
 * Weekly digest output
 */
export interface WeeklyDigest {
  workspaceId: string;
  period: { start: Date; end: Date };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netCashflow: number;
    transactionCount: number;
    comparedToLastWeek: {
      incomeChange: number;
      expensesChange: number;
      netChange: number;
    };
  };
  topCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
    transactionCount: number;
  }>;
  topMerchants: Array<{
    merchant: string;
    amount: number;
    transactionCount: number;
  }>;
  highlights: DigestHighlight[];
  insights: Insight[];
  actionItems: DigestActionItem[];
  subscriptionsSummary: {
    activeCount: number;
    monthlyTotal: number;
    upcomingCharges: Array<{
      name: string;
      amount: number;
      expectedDate: Date;
    }>;
  };
  forecast: {
    nextWeekProjection: number;
    cashflowStatus: CashFlowStatus;
    projectionBasis: string;
  };
  currency: string;
  generatedAt: Date;
}

/**
 * Generate a weekly digest from input data
 */
export function generateWeeklyDigest(input: WeeklyDigestInput): WeeklyDigest {
  const { workspaceId, transactions, subscriptions, insights, previousWeekData } = input;

  // Calculate period (last 7 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  // Filter transactions for this week
  const weekTransactions = transactions.filter(
    (tx) => tx.postedAt >= startDate && tx.postedAt <= endDate
  );

  // Calculate summary
  const summary = calculateSummary(weekTransactions, previousWeekData);

  // Determine currency
  const currency = input.currency || determineCurrency(weekTransactions);

  // Calculate top categories
  const topCategories = calculateTopCategories(weekTransactions);

  // Calculate top merchants
  const topMerchants = calculateTopMerchants(weekTransactions);

  // Generate highlights
  const highlights = generateHighlights(
    summary,
    topCategories,
    topMerchants,
    subscriptions,
    currency
  );

  // Filter relevant insights (this week only)
  const weekInsights = insights.filter(
    (insight) => insight.createdAt >= startDate && insight.createdAt <= endDate
  );

  // Generate action items
  const actionItems = generateActionItems(weekInsights, subscriptions, summary);

  // Generate subscriptions summary
  const subscriptionsSummary = generateSubscriptionsSummary(subscriptions);

  // Generate forecast
  const forecast = generateForecast(summary, transactions);

  return {
    workspaceId,
    period: { start: startDate, end: endDate },
    summary,
    topCategories,
    topMerchants,
    highlights,
    insights: weekInsights.slice(0, 5), // Top 5 insights
    actionItems,
    subscriptionsSummary,
    forecast,
    currency,
    generatedAt: new Date(),
  };
}

/**
 * Calculate weekly summary
 */
function calculateSummary(
  transactions: TransactionInput[],
  previousWeekData?: { totalIncome: number; totalExpenses: number; netCashflow: number }
): WeeklyDigest['summary'] {
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of transactions) {
    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    if (amount >= 0) {
      totalIncome += amount;
    } else {
      totalExpenses += Math.abs(amount);
    }
  }

  const netCashflow = totalIncome - totalExpenses;

  // Calculate week-over-week changes
  let incomeChange = 0;
  let expensesChange = 0;
  let netChange = 0;

  if (previousWeekData) {
    incomeChange =
      previousWeekData.totalIncome > 0
        ? ((totalIncome - previousWeekData.totalIncome) / previousWeekData.totalIncome) * 100
        : totalIncome > 0
          ? 100
          : 0;

    expensesChange =
      previousWeekData.totalExpenses > 0
        ? ((totalExpenses - previousWeekData.totalExpenses) / previousWeekData.totalExpenses) * 100
        : totalExpenses > 0
          ? 100
          : 0;

    netChange =
      previousWeekData.netCashflow !== 0
        ? ((netCashflow - previousWeekData.netCashflow) / Math.abs(previousWeekData.netCashflow)) *
          100
        : netCashflow !== 0
          ? 100
          : 0;
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netCashflow: Math.round(netCashflow * 100) / 100,
    transactionCount: transactions.length,
    comparedToLastWeek: {
      incomeChange: Math.round(incomeChange * 10) / 10,
      expensesChange: Math.round(expensesChange * 10) / 10,
      netChange: Math.round(netChange * 10) / 10,
    },
  };
}

/**
 * Determine most common currency from transactions
 */
function determineCurrency(transactions: TransactionInput[]): string {
  if (transactions.length === 0) return 'EUR';

  const currencyCount = new Map<string, number>();
  for (const tx of transactions) {
    const count = currencyCount.get(tx.currency) || 0;
    currencyCount.set(tx.currency, count + 1);
  }

  let maxCount = 0;
  let primaryCurrency = 'EUR';
  for (const [currency, count] of currencyCount.entries()) {
    if (count > maxCount) {
      maxCount = count;
      primaryCurrency = currency;
    }
  }

  return primaryCurrency;
}

/**
 * Calculate top spending categories
 */
function calculateTopCategories(transactions: TransactionInput[]): WeeklyDigest['topCategories'] {
  const categoryData = new Map<string, { amount: number; count: number }>();

  let totalExpenses = 0;

  for (const tx of transactions) {
    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    if (amount >= 0) continue; // Only expenses

    // Extract category name from categorizations array if available
    const category = tx.categorizations?.[0]?.category?.name || 'Uncategorized';
    const absAmount = Math.abs(amount);

    const existing = categoryData.get(category) || { amount: 0, count: 0 };
    existing.amount += absAmount;
    existing.count++;
    categoryData.set(category, existing);

    totalExpenses += absAmount;
  }

  return Array.from(categoryData.entries())
    .map(([category, data]) => ({
      category,
      amount: Math.round(data.amount * 100) / 100,
      percentage: totalExpenses > 0 ? Math.round((data.amount / totalExpenses) * 1000) / 10 : 0,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

/**
 * Calculate top merchants
 */
function calculateTopMerchants(transactions: TransactionInput[]): WeeklyDigest['topMerchants'] {
  const merchantData = new Map<string, { amount: number; count: number }>();

  for (const tx of transactions) {
    const amount = typeof tx.amount === 'number' ? tx.amount : tx.amount.toNumber();
    if (amount >= 0) continue; // Only expenses
    if (!tx.description) continue;

    const merchant = tx.description;
    const absAmount = Math.abs(amount);

    const existing = merchantData.get(merchant) || { amount: 0, count: 0 };
    existing.amount += absAmount;
    existing.count++;
    merchantData.set(merchant, existing);
  }

  return Array.from(merchantData.entries())
    .map(([merchant, data]) => ({
      merchant,
      amount: Math.round(data.amount * 100) / 100,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

/**
 * Generate notable highlights
 */
function generateHighlights(
  summary: WeeklyDigest['summary'],
  _topCategories: WeeklyDigest['topCategories'],
  topMerchants: WeeklyDigest['topMerchants'],
  subscriptions: Subscription[],
  currency: string
): DigestHighlight[] {
  const highlights: DigestHighlight[] = [];

  // Positive cashflow
  if (summary.netCashflow > 0) {
    highlights.push({
      type: 'positive',
      title: 'Positive Cash Flow',
      description: `You earned more than you spent this week`,
      amount: summary.netCashflow,
      currency,
    });
  } else if (summary.netCashflow < 0) {
    highlights.push({
      type: 'negative',
      title: 'Negative Cash Flow',
      description: `Expenses exceeded income this week`,
      amount: Math.abs(summary.netCashflow),
      currency,
    });
  }

  // Significant week-over-week changes
  if (summary.comparedToLastWeek.expensesChange > 20) {
    highlights.push({
      type: 'negative',
      title: 'Spending Increased',
      description: `Spending up ${summary.comparedToLastWeek.expensesChange.toFixed(1)}% vs last week`,
    });
  } else if (summary.comparedToLastWeek.expensesChange < -20) {
    highlights.push({
      type: 'positive',
      title: 'Spending Decreased',
      description: `Spending down ${Math.abs(summary.comparedToLastWeek.expensesChange).toFixed(1)}% vs last week`,
    });
  }

  // Top merchant
  if (topMerchants.length > 0) {
    const topMerchant = topMerchants[0];
    highlights.push({
      type: 'neutral',
      title: 'Top Merchant',
      description: `${topMerchant.merchant} - ${topMerchant.transactionCount} transactions`,
      amount: topMerchant.amount,
      currency,
    });
  }

  // Subscription alerts
  const flaggedSubscriptions = subscriptions.filter((s) => s.flags.length > 0);
  if (flaggedSubscriptions.length > 0) {
    highlights.push({
      type: 'negative',
      title: 'Subscription Alerts',
      description: `${flaggedSubscriptions.length} subscription(s) need attention`,
    });
  }

  return highlights.slice(0, 5);
}

/**
 * Generate action items based on insights and data
 */
function generateActionItems(
  insights: Insight[],
  subscriptions: Subscription[],
  summary: WeeklyDigest['summary']
): DigestActionItem[] {
  const actionItems: DigestActionItem[] = [];

  // High severity insights become action items
  const alertInsights = insights.filter((i) => i.severity === 'alert');
  for (const insight of alertInsights.slice(0, 2)) {
    actionItems.push({
      title: insight.title,
      description: insight.message,
      url: insight.actionUrl || '/insights',
      priority: 'high',
    });
  }

  // Flagged subscriptions
  const flaggedSubs = subscriptions.filter((s) => s.flags.some((f) => f.severity === 'alert'));
  if (flaggedSubs.length > 0) {
    actionItems.push({
      title: 'Review Flagged Subscriptions',
      description: `${flaggedSubs.length} subscription(s) have alerts that need review`,
      url: '/subscriptions',
      priority: 'high',
    });
  }

  // Negative cashflow warning
  if (summary.netCashflow < 0 && Math.abs(summary.netCashflow) > summary.totalExpenses * 0.5) {
    actionItems.push({
      title: 'Review Spending',
      description: 'Your expenses significantly exceeded income this week',
      url: '/transactions',
      priority: 'medium',
    });
  }

  // Warning insights
  const warningInsights = insights.filter((i) => i.severity === 'warning');
  for (const insight of warningInsights.slice(0, 2)) {
    if (actionItems.length >= 5) break;
    actionItems.push({
      title: insight.title,
      description: insight.message,
      url: insight.actionUrl || '/insights',
      priority: 'medium',
    });
  }

  return actionItems.slice(0, 5);
}

/**
 * Generate subscriptions summary
 */
function generateSubscriptionsSummary(
  subscriptions: Subscription[]
): WeeklyDigest['subscriptionsSummary'] {
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const monthlyTotal = activeSubscriptions.reduce((sum, s) => sum + s.monthlyEquivalent, 0);

  // Calculate upcoming charges (next 7 days)
  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcomingCharges: WeeklyDigest['subscriptionsSummary']['upcomingCharges'] = [];

  for (const sub of activeSubscriptions) {
    // Estimate next charge date based on frequency and last charge
    const nextCharge = estimateNextChargeDate(sub);
    if (nextCharge >= now && nextCharge <= nextWeek) {
      upcomingCharges.push({
        name: sub.merchantName,
        amount: sub.amount,
        expectedDate: nextCharge,
      });
    }
  }

  return {
    activeCount: activeSubscriptions.length,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    upcomingCharges: upcomingCharges.sort(
      (a, b) => a.expectedDate.getTime() - b.expectedDate.getTime()
    ),
  };
}

/**
 * Estimate next charge date for a subscription
 */
function estimateNextChargeDate(subscription: Subscription): Date {
  const lastCharge = new Date(subscription.lastCharge);
  const nextCharge = new Date(lastCharge);

  switch (subscription.frequency) {
    case 'weekly':
      nextCharge.setDate(nextCharge.getDate() + 7);
      break;
    case 'biweekly':
      nextCharge.setDate(nextCharge.getDate() + 14);
      break;
    case 'monthly':
      nextCharge.setMonth(nextCharge.getMonth() + 1);
      break;
    case 'quarterly':
      nextCharge.setMonth(nextCharge.getMonth() + 3);
      break;
    case 'annual':
      nextCharge.setFullYear(nextCharge.getFullYear() + 1);
      break;
  }

  return nextCharge;
}

/**
 * Generate cash flow forecast
 */
function generateForecast(
  currentSummary: WeeklyDigest['summary'],
  _allTransactions: TransactionInput[]
): WeeklyDigest['forecast'] {
  // Simple projection based on current week
  const projectedExpenses = currentSummary.totalExpenses;
  const projectedIncome = currentSummary.totalIncome;
  const projectedNet = projectedIncome - projectedExpenses;

  // Determine status
  let status: CashFlowStatus;
  if (projectedNet > 0) {
    status = 'healthy';
  } else if (projectedNet >= -projectedExpenses * 0.2) {
    status = 'warning';
  } else {
    status = 'critical';
  }

  return {
    nextWeekProjection: Math.round(projectedNet * 100) / 100,
    cashflowStatus: status,
    projectionBasis: 'Based on current week activity',
  };
}

/**
 * Get severity color for digest UI
 */
export function getDigestHighlightColor(type: DigestHighlight['type']): {
  bg: string;
  text: string;
  icon: string;
} {
  switch (type) {
    case 'positive':
      return { bg: 'bg-green-50', text: 'text-green-700', icon: 'TrendingUp' };
    case 'negative':
      return { bg: 'bg-red-50', text: 'text-red-700', icon: 'TrendingDown' };
    case 'neutral':
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700', icon: 'Info' };
  }
}

/**
 * Get priority color for action items
 */
export function getActionItemPriorityColor(priority: DigestActionItem['priority']): {
  bg: string;
  text: string;
} {
  switch (priority) {
    case 'high':
      return { bg: 'bg-red-100', text: 'text-red-800' };
    case 'medium':
      return { bg: 'bg-yellow-100', text: 'text-yellow-800' };
    case 'low':
    default:
      return { bg: 'bg-blue-100', text: 'text-blue-800' };
  }
}

/**
 * Get cashflow status color and icon
 */
export function getCashFlowStatusInfo(status: CashFlowStatus): {
  color: string;
  bgColor: string;
  icon: string;
  label: string;
} {
  switch (status) {
    case 'healthy':
      return {
        color: 'text-green-700',
        bgColor: 'bg-green-50',
        icon: 'CheckCircle',
        label: 'Healthy',
      };
    case 'warning':
      return {
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-50',
        icon: 'AlertTriangle',
        label: 'Warning',
      };
    case 'critical':
      return {
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        icon: 'AlertCircle',
        label: 'Critical',
      };
  }
}
