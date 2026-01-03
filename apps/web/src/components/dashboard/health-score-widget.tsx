'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { AlertCircle, TrendingUp, TrendingDown, Wallet, BarChart3, Calendar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useLocaleFormat } from '@/hooks/use-locale-format';

interface HealthMetric {
  name: string;
  score: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  value: string;
  description: string;
}

interface HealthScoreData {
  overallScore: number;
  grade: string;
  rating: string;
  metrics: HealthMetric[];
  summary: string;
  recommendations: string[];
  calculatedAt: string;
}

interface HealthScoreWidgetProps {
  workspaceId: string;
}

const ratingColors: Record<string, string> = {
  excellent: 'text-success-600',
  good: 'text-chart-income',
  fair: 'text-yellow-500',
  poor: 'text-orange-500',
  critical: 'text-danger-600',
};

const metricIcons: Record<string, React.ReactNode> = {
  profitability: <TrendingUp className="h-4 w-4" />,
  runway: <Calendar className="h-4 w-4" />,
  reserves: <Wallet className="h-4 w-4" />,
  expensePredictability: <BarChart3 className="h-4 w-4" />,
  incomeStability: <TrendingDown className="h-4 w-4" />,
};

// Map API metric names to translation keys
const metricNameKeyMap: Record<string, string> = {
  profitability: 'profitability',
  runway: 'runway',
  reserves: 'reserves',
  expensePredictability: 'expensePredictability',
  incomeStability: 'incomeStability',
};

// Map English recommendations to translation keys (reuse from smart-ai-summary)
const recommendationKeyMap: Record<string, string> = {
  'Focus on generating revenue streams': 'focusOnRevenue',
  'Consider ways to increase margins': 'considerIncreaseMargins',
  'Review expenses and pricing to improve profitability': 'reviewExpensesAndPricing',
  'Urgent: Cut expenses or increase revenue immediately': 'urgentCutExpenses',
  'Build more cash reserves when possible': 'buildMoreReserves',
  'Prioritize extending your cash runway': 'prioritizeExtendRunway',
  'Urgent: Take immediate action to extend runway': 'urgentExtendRunway',
  'Emergency: Secure funding or cut expenses immediately': 'emergencySecureFunding',
  'Build an emergency fund of 3-6 months expenses': 'buildEmergencyFund',
  'Prioritize building cash reserves': 'prioritizeBuildingReserves',
  'Urgent: Build emergency cash buffer': 'urgentBuildBuffer',
  'Track and categorize expenses for better predictability': 'trackAndCategorize',
  'Review spending patterns and identify recurring costs': 'reviewSpendingPatterns',
  'Focus on establishing revenue streams': 'focusOnEstablishingRevenue',
  'Diversify revenue sources for more stability': 'diversifyRevenueSources',
  'Build more predictable revenue streams': 'buildPredictableRevenue',
};

export function HealthScoreWidget({ workspaceId }: HealthScoreWidgetProps) {
  const t = useTranslations('dashboard');
  const tRatings = useTranslations('dashboard.healthScore.ratings');
  const tMetrics = useTranslations('dashboard.healthScore.metrics');
  const tSummaries = useTranslations('dashboard.healthScore.summaries');
  const tRec = useTranslations('dashboard.recommendations');
  const { formatNumber } = useLocaleFormat();
  const [data, setData] = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  // Helper to translate metric name
  const translateMetricName = (name: string): string => {
    const key = metricNameKeyMap[name];
    if (key) {
      return tMetrics(key);
    }
    // Fallback: convert camelCase to Title Case
    return name.replace(/([A-Z])/g, ' $1').trim();
  };

  // Helper to translate rating
  const translateRating = (rating: string): string => {
    const validRatings = ['excellent', 'good', 'fair', 'poor', 'critical'];
    if (validRatings.includes(rating)) {
      return tRatings(rating as 'excellent' | 'good' | 'fair' | 'poor' | 'critical');
    }
    return rating;
  };

  // Helper to translate recommendation
  const translateRecommendation = (rec: string): string => {
    const key = recommendationKeyMap[rec];
    if (key) {
      return tRec(key);
    }
    return rec;
  };

  // Helper to translate summary
  const translateSummary = (summary: string, rating: string, metrics: HealthMetric[]): string => {
    // Find the worst performing metric for the {area} parameter
    const worstMetric = metrics.reduce((worst, current) =>
      current.score < worst.score ? current : worst
    , metrics[0]);

    const area = worstMetric ? translateMetricName(worstMetric.name).toLowerCase() : '';

    const validRatings = ['excellent', 'good', 'fair', 'poor', 'critical'];
    if (validRatings.includes(rating)) {
      return tSummaries(rating as 'excellent' | 'good' | 'fair' | 'poor' | 'critical', { area });
    }
    return summary;
  };

  const fetchHealthScore = useCallback(async () => {
    try {
      const response = await fetch(`/api/reports/health-score?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch health score');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch health score:', err);
      setError(err instanceof Error ? err.message : 'Failed to load health score');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchHealthScore();
    }
  }, [workspaceId, fetchHealthScore]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 flex items-center justify-center">
          <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">{t('financialHealth')}</h2>
        <div className="mt-4 flex items-center gap-2 text-sm text-danger-600">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Calculate the stroke dasharray for the circular progress
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (data.overallScore / 100) * circumference;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'stroke-success-600';
    if (score >= 60) return 'stroke-chart-income';
    if (score >= 40) return 'stroke-yellow-500';
    if (score >= 20) return 'stroke-orange-500';
    return 'stroke-danger-600';
  };

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('financialHealth')}</h2>

      {/* Score Circle */}
      <div className="mt-4 flex flex-col items-center">
        <div className="relative h-32 w-32">
          <svg className="h-full w-full -rotate-90">
            {/* Background circle */}
            <circle cx="64" cy="64" r="45" fill="none" className="stroke-muted" strokeWidth="10" />
            {/* Progress circle */}
            <circle
              cx="64"
              cy="64"
              r="45"
              fill="none"
              className={getScoreColor(data.overallScore)}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-foreground">{formatNumber(data.overallScore)}</span>
            <span className="text-sm font-medium text-muted-foreground">{data.grade}</span>
          </div>
        </div>
        <p className={`mt-2 text-sm font-medium ${ratingColors[data.rating] || 'text-foreground'}`}>
          {translateRating(data.rating)}
        </p>
      </div>

      {/* Metrics Breakdown */}
      <div className="mt-6 space-y-3">
        {(data.metrics || []).map((metric) => (
          <div key={metric.name} className="flex items-center gap-3">
            <div className="flex-shrink-0 text-muted-foreground">
              {metricIcons[metric.name] || <BarChart3 className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground truncate">
                  {translateMetricName(metric.name)}
                </span>
                <span className={`text-sm font-medium ${ratingColors[metric.rating]}`}>
                  {formatNumber(metric.score)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    metric.rating === 'excellent'
                      ? 'bg-success-600'
                      : metric.rating === 'good'
                        ? 'bg-chart-income'
                        : metric.rating === 'fair'
                          ? 'bg-yellow-500'
                          : metric.rating === 'poor'
                            ? 'bg-orange-500'
                            : 'bg-danger-600'
                  }`}
                  style={{ width: `${metric.score}%`, transition: 'width 1s ease-out' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <p className="mt-4 text-sm text-muted-foreground">
        {translateSummary(data.summary, data.rating, data.metrics || [])}
      </p>

      {/* Top Recommendation */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div className="mt-4 rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-foreground">{t('topRecommendation')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {translateRecommendation(data.recommendations[0])}
          </p>
        </div>
      )}
    </div>
  );
}
