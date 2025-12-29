/**
 * Financial Health Score Calculator
 *
 * Calculates a comprehensive financial health score (0-100) based on:
 * 1. Profitability (30%) - Are you making money?
 * 2. Cash Runway (25%) - How long can you survive?
 * 3. Cash Reserves (20%) - Do you have emergency funds?
 * 4. Expense Predictability (15%) - Are expenses stable?
 * 5. Income Stability (10%) - Is income consistent?
 *
 * Grades:
 * A (90-100): Excellent - Strong financial position
 * B (75-89): Good - Healthy with room for improvement
 * C (60-74): Fair - Some areas need attention
 * D (40-59): Poor - Significant improvements needed
 * F (0-39): Critical - Urgent action required
 */

import type {
  FinancialHealthScore,
  HealthMetric,
  HealthRating,
  HealthScoreInput,
} from './types';

/**
 * Metric weights (must sum to 1.0)
 */
const WEIGHTS = {
  profitability: 0.30,
  runway: 0.25,
  reserves: 0.20,
  expensePredictability: 0.15,
  incomeStability: 0.10,
};

/**
 * Calculate financial health score
 */
export function calculateHealthScore(input: HealthScoreInput): FinancialHealthScore {
  const metrics: HealthMetric[] = [
    calculateProfitabilityMetric(input),
    calculateRunwayMetric(input),
    calculateReservesMetric(input),
    calculateExpensePredictabilityMetric(input),
    calculateIncomeStabilityMetric(input),
  ];

  // Calculate weighted overall score
  const overallScore = Math.round(
    metrics.reduce((sum, m) => sum + m.score * m.weight, 0)
  );

  const rating = scoreToRating(overallScore);
  const grade = scoreToGrade(overallScore);

  // Collect recommendations from low-scoring metrics
  const recommendations = metrics
    .filter((m) => m.recommendation && m.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((m) => m.recommendation!)
    .filter(Boolean);

  const summary = generateSummary(overallScore, rating, metrics);

  return {
    overallScore,
    rating,
    grade,
    metrics,
    recommendations,
    currency: input.currency,
    calculatedAt: new Date(),
    summary,
  };
}

/**
 * Profitability metric (30%)
 * Based on net income margin: (income - expenses) / income
 */
function calculateProfitabilityMetric(input: HealthScoreInput): HealthMetric {
  const { avgMonthlyIncome, avgMonthlyExpenses } = input;

  let score: number;
  let description: string;
  let recommendation: string | undefined;

  if (avgMonthlyIncome === 0) {
    score = 0;
    description = 'No income detected';
    recommendation = 'Focus on generating revenue streams';
  } else {
    const margin = (avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome;

    if (margin >= 0.3) {
      // 30%+ margin = 100
      score = 100;
      description = `Excellent profit margin of ${(margin * 100).toFixed(0)}%`;
    } else if (margin >= 0.15) {
      // 15-30% margin = 80-100
      score = 80 + (margin - 0.15) / 0.15 * 20;
      description = `Healthy profit margin of ${(margin * 100).toFixed(0)}%`;
    } else if (margin >= 0) {
      // 0-15% margin = 50-80
      score = 50 + margin / 0.15 * 30;
      description = `Break-even with ${(margin * 100).toFixed(0)}% margin`;
      recommendation = 'Consider ways to increase margins';
    } else if (margin >= -0.2) {
      // -20% to 0 = 20-50
      score = 20 + (margin + 0.2) / 0.2 * 30;
      description = `Operating at a ${(Math.abs(margin) * 100).toFixed(0)}% loss`;
      recommendation = 'Review expenses and pricing to improve profitability';
    } else {
      // Below -20% = 0-20
      score = Math.max(0, 20 + margin * 100);
      description = `Significant losses of ${(Math.abs(margin) * 100).toFixed(0)}%`;
      recommendation = 'Urgent: Cut expenses or increase revenue immediately';
    }
  }

  return {
    name: 'Profitability',
    score: Math.round(score),
    weight: WEIGHTS.profitability,
    rating: scoreToRating(score),
    description,
    recommendation,
  };
}

/**
 * Cash Runway metric (25%)
 * Based on months of runway remaining
 */
function calculateRunwayMetric(input: HealthScoreInput): HealthMetric {
  const { runwayMonths } = input;

  let score: number;
  let description: string;
  let recommendation: string | undefined;

  if (!isFinite(runwayMonths) || runwayMonths > 24) {
    score = 100;
    description = 'Unlimited runway - business is profitable';
  } else if (runwayMonths >= 12) {
    score = 90 + (runwayMonths - 12) / 12 * 10;
    description = `Strong runway of ${Math.floor(runwayMonths)} months`;
  } else if (runwayMonths >= 6) {
    score = 70 + (runwayMonths - 6) / 6 * 20;
    description = `Adequate runway of ${Math.floor(runwayMonths)} months`;
    recommendation = 'Build more cash reserves when possible';
  } else if (runwayMonths >= 3) {
    score = 40 + (runwayMonths - 3) / 3 * 30;
    description = `Limited runway of ${Math.floor(runwayMonths)} months`;
    recommendation = 'Prioritize extending your cash runway';
  } else if (runwayMonths > 0) {
    score = runwayMonths / 3 * 40;
    description = `Critical: Only ${runwayMonths.toFixed(1)} months of runway`;
    recommendation = 'Urgent: Take immediate action to extend runway';
  } else {
    score = 0;
    description = 'No runway - cash depleted';
    recommendation = 'Emergency: Secure funding or cut expenses immediately';
  }

  return {
    name: 'Cash Runway',
    score: Math.round(score),
    weight: WEIGHTS.runway,
    rating: scoreToRating(score),
    description,
    recommendation,
  };
}

/**
 * Cash Reserves metric (20%)
 * Based on ratio of current balance to monthly expenses
 */
function calculateReservesMetric(input: HealthScoreInput): HealthMetric {
  const { currentBalance, avgMonthlyExpenses } = input;

  let score: number;
  let description: string;
  let recommendation: string | undefined;

  if (avgMonthlyExpenses === 0) {
    score = currentBalance > 0 ? 100 : 50;
    description = currentBalance > 0 ? 'Cash available, no expenses detected' : 'No activity detected';
  } else {
    const monthsCovered = currentBalance / avgMonthlyExpenses;

    if (monthsCovered >= 6) {
      score = 100;
      description = `Strong reserves covering ${monthsCovered.toFixed(1)} months`;
    } else if (monthsCovered >= 3) {
      score = 70 + (monthsCovered - 3) / 3 * 30;
      description = `Good reserves covering ${monthsCovered.toFixed(1)} months`;
    } else if (monthsCovered >= 1) {
      score = 40 + (monthsCovered - 1) / 2 * 30;
      description = `Limited reserves of ${monthsCovered.toFixed(1)} months`;
      recommendation = 'Build an emergency fund of 3-6 months expenses';
    } else if (monthsCovered > 0) {
      score = monthsCovered * 40;
      description = `Low reserves: only ${(monthsCovered * 30).toFixed(0)} days coverage`;
      recommendation = 'Prioritize building cash reserves';
    } else {
      score = 0;
      description = 'No cash reserves';
      recommendation = 'Urgent: Build emergency cash buffer';
    }
  }

  return {
    name: 'Cash Reserves',
    score: Math.round(score),
    weight: WEIGHTS.reserves,
    rating: scoreToRating(score),
    description,
    recommendation,
  };
}

/**
 * Expense Predictability metric (15%)
 * Based on portion of expenses that are recurring/predictable
 */
function calculateExpensePredictabilityMetric(input: HealthScoreInput): HealthMetric {
  const { avgMonthlyExpenses, monthlyRecurringExpenses, expenseVolatility } = input;

  let score: number;
  let description: string;
  let recommendation: string | undefined;

  if (avgMonthlyExpenses === 0) {
    score = 50;
    description = 'No expenses to analyze';
  } else {
    const recurringRatio = monthlyRecurringExpenses / avgMonthlyExpenses;

    // Base score on recurring ratio (50%) and volatility (50%)
    const recurringScore = Math.min(100, recurringRatio * 100);
    const volatilityScore = Math.max(0, 100 - expenseVolatility * 200); // Lower volatility is better

    score = recurringScore * 0.5 + volatilityScore * 0.5;

    if (score >= 80) {
      description = `Highly predictable expenses (${(recurringRatio * 100).toFixed(0)}% recurring)`;
    } else if (score >= 60) {
      description = `Moderately predictable expenses (${(recurringRatio * 100).toFixed(0)}% recurring)`;
    } else if (score >= 40) {
      description = `Variable expenses with ${(recurringRatio * 100).toFixed(0)}% recurring`;
      recommendation = 'Track and categorize expenses for better predictability';
    } else {
      description = 'Highly variable expenses';
      recommendation = 'Review spending patterns and identify recurring costs';
    }
  }

  return {
    name: 'Expense Predictability',
    score: Math.round(score),
    weight: WEIGHTS.expensePredictability,
    rating: scoreToRating(score),
    description,
    recommendation,
  };
}

/**
 * Income Stability metric (10%)
 * Based on volatility of monthly income
 */
function calculateIncomeStabilityMetric(input: HealthScoreInput): HealthMetric {
  const { avgMonthlyIncome, incomeVolatility } = input;

  let score: number;
  let description: string;
  let recommendation: string | undefined;

  if (avgMonthlyIncome === 0) {
    score = 0;
    description = 'No income detected';
    recommendation = 'Focus on establishing revenue streams';
  } else {
    // Lower volatility = higher score
    // Volatility of 0 = 100, volatility of 0.5+ = 0
    score = Math.max(0, 100 - incomeVolatility * 200);

    if (score >= 80) {
      description = 'Very stable income';
    } else if (score >= 60) {
      description = 'Moderately stable income';
    } else if (score >= 40) {
      description = 'Variable income';
      recommendation = 'Diversify revenue sources for more stability';
    } else {
      description = 'Highly volatile income';
      recommendation = 'Build more predictable revenue streams';
    }
  }

  return {
    name: 'Income Stability',
    score: Math.round(score),
    weight: WEIGHTS.incomeStability,
    rating: scoreToRating(score),
    description,
    recommendation,
  };
}

/**
 * Convert score to rating
 */
function scoreToRating(score: number): HealthRating {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

/**
 * Convert score to letter grade
 */
function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D+';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Generate summary description
 */
function generateSummary(
  _score: number,
  rating: HealthRating,
  metrics: HealthMetric[]
): string {
  const weakest = metrics.reduce((min, m) => (m.score < min.score ? m : min));
  const strongest = metrics.reduce((max, m) => (m.score > max.score ? m : max));

  switch (rating) {
    case 'excellent':
      return `Your financial health is excellent! Your strongest area is ${strongest.name.toLowerCase()}. Keep up the great work.`;
    case 'good':
      return `Your financial health is good. ${strongest.name} is strong, but ${weakest.name.toLowerCase()} could use some attention.`;
    case 'fair':
      return `Your financial health is fair. Focus on improving ${weakest.name.toLowerCase()} to boost your overall score.`;
    case 'poor':
      return `Your financial health needs attention. ${weakest.name} is the most urgent area to address.`;
    case 'critical':
      return `Your financial health is critical. Immediate action is needed on ${weakest.name.toLowerCase()}.`;
  }
}

/**
 * Calculate volatility (coefficient of variation)
 * Returns standard deviation / mean
 */
export function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 0;

  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return stdDev / Math.abs(mean);
}
