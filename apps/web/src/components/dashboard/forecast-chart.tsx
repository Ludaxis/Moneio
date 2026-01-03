'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { axisStyle, gridStyle, chartPalette, areaChartDefaults } from '@moneio/ui/lib/chart-theme';
import { ChartTooltip, chartTooltipContentStyle } from '@moneio/ui/patterns';
import { AlertCircle, TrendingUp, Calendar, TrendingDown, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

import { useIsRTL } from '@/hooks/use-direction';
import { useLocaleFormat } from '@/hooks/use-locale-format';

interface ForecastMonth {
  month: string;
  label: string;
  projectedIncome: number;
  projectedExpenses: number;
  netCashflow: number;
  projectedBalance: number;
  confidence: number;
  isActual: boolean;
}

interface ForecastSummary {
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
  totalRecurringExpenses: number;
  totalRecurringIncome: number;
  endingBalance: number;
  monthsUntilNegative: number | null;
  trend: 'improving' | 'stable' | 'declining';
  insights: string[];
}

interface ForecastData {
  months: ForecastMonth[];
  summary: ForecastSummary;
  currency: string;
  currentBalance: number;
  overallConfidence: number;
  generatedAt: string;
  dataQuality: {
    historicalMonths: number;
    recurringExpensesDetected: number;
    recurringIncomeDetected: number;
    transactionsAnalyzed: number;
  };
}

interface ForecastChartProps {
  workspaceId: string;
  months?: number;
}

// Map English insight patterns to translation keys
const insightPatternMap: Array<{
  pattern: RegExp;
  key: string;
  extractParams?: (match: RegExpMatchArray) => Record<string, string>;
}> = [
  {
    pattern: /Projected monthly deficit of \$?([\d,]+)/i,
    key: 'projectedDeficit',
    extractParams: (match) => ({ amount: `$${match[1]}` }),
  },
  {
    pattern: /Warning: Cash may run out in (\d+) month/i,
    key: 'cashMayRunOut',
    extractParams: (match) => ({ months: match[1] }),
  },
  {
    pattern: /Positive outlook/i,
    key: 'positiveOutlook',
  },
  {
    pattern: /Finances appear stable/i,
    key: 'stableFinances',
  },
  {
    pattern: /High expense variability/i,
    key: 'highExpenseVariability',
  },
  {
    pattern: /Seasonal.*pattern/i,
    key: 'seasonalPattern',
  },
];

export function ForecastChart({ workspaceId, months = 6 }: ForecastChartProps) {
  const t = useTranslations('dashboard');
  const tInsights = useTranslations('dashboard.forecastInsights');
  const { formatCurrency, formatNumber } = useLocaleFormat();
  const isRTL = useIsRTL();
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chartData = useMemo(() => {
    if (!data?.months) return [];
    return isRTL ? [...data.months].reverse() : data.months;
  }, [data?.months, isRTL]);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchForecast = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/reports/forecast?workspaceId=${workspaceId}&months=${months}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch forecast');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch forecast:', err);
      setError(err instanceof Error ? err.message : 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, months]);

  useEffect(() => {
    if (workspaceId) {
      fetchForecast();
    }
  }, [workspaceId, fetchForecast]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t('cashFlowForecast')}</h2>
        <div className="mt-4 flex items-center gap-2 text-sm text-danger-600">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data || !data.months || data.months.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t('cashFlowForecast')}</h2>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t('notEnoughDataForForecast')}</p>
        </div>
      </div>
    );
  }

  // Calculate avg monthly net from the summary
  const avgMonthlyNet = data.summary.avgMonthlyIncome - data.summary.avgMonthlyExpenses;

  // Determine runway status
  const getRunwayStatus = () => {
    const monthsLeft = data.summary.monthsUntilNegative;
    if (monthsLeft === null) return { status: 'excellent', months: '12' };
    if (monthsLeft <= 3) return { status: 'critical', months: String(monthsLeft) };
    if (monthsLeft <= 6) return { status: 'warning', months: String(monthsLeft) };
    return { status: 'healthy', months: String(monthsLeft) };
  };

  const runway = getRunwayStatus();

  const runwayStatusColors: Record<string, string> = {
    critical: 'text-danger-600 bg-danger-50 dark:bg-danger-950',
    warning: 'text-orange-600 bg-orange-50 dark:bg-orange-950',
    healthy: 'text-success-600 bg-success-50 dark:bg-success-950',
    excellent: 'text-chart-income bg-green-50 dark:bg-green-950',
  };

  const trendIcons = {
    improving: <TrendingUp className="h-4 w-4 text-success-600" />,
    stable: <Minus className="h-4 w-4 text-muted-foreground" />,
    declining: <TrendingDown className="h-4 w-4 text-danger-600" />,
  };

  // Find lowest balance point
  const lowestPoint = data.months.reduce(
    (min, m) =>
      m.projectedBalance < min.amount ? { month: m.label, amount: m.projectedBalance } : min,
    { month: '', amount: Infinity }
  );

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{t('cashFlowForecast')}</h2>
          {trendIcons[data.summary.trend]}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatNumber(Math.round(data.overallConfidence || 0))}% {t('confidence')}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{t('currentBalance')}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(data.currentBalance, data.currency)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{t('projectedEnd')}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(data.summary.endingBalance, data.currency)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{t('avgMonthlyNet')}</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              avgMonthlyNet >= 0 ? 'text-chart-income' : 'text-chart-expense'
            }`}
          >
            {formatCurrency(avgMonthlyNet, data.currency)}
          </p>
        </div>
        <div className={`rounded-lg p-3 ${runwayStatusColors[runway.status]}`}>
          <p className="text-xs opacity-80">{t('cashRunway')}</p>
          <p className="mt-1 text-lg font-semibold">
            {formatNumber(Number(runway.months))}+ {t('months')}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 h-64 min-h-[256px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: isRTL ? 0 : 10, left: isRTL ? 10 : 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartPalette[0]}
                  stopOpacity={areaChartDefaults.fillOpacity}
                />
                <stop offset="95%" stopColor={chartPalette[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis
              dataKey="label"
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              reversed={isRTL}
            />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatCurrency(value, data.currency)}
              width={100}
              orientation={isRTL ? 'right' : 'left'}
            />
            <Tooltip
              content={<ChartTooltip currency={data.currency} formatLabel={(label) => label} />}
              contentStyle={chartTooltipContentStyle}
            />
            {/* Zero line */}
            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
            {/* Lowest cash point marker */}
            {lowestPoint.amount < data.currentBalance && lowestPoint.amount !== Infinity && (
              <ReferenceLine
                y={lowestPoint.amount}
                stroke="hsl(var(--chart-expense))"
                strokeDasharray="5 5"
                strokeOpacity={0.6}
                label={{
                  value: t('lowest'),
                  position: isRTL ? 'left' : 'right',
                  fill: 'hsl(var(--chart-expense))',
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="projectedBalance"
              name={t('projectedBalance')}
              stroke={chartPalette[0]}
              strokeWidth={areaChartDefaults.strokeWidth}
              fill="url(#cashGradient)"
              dot={false}
              activeDot={{
                r: areaChartDefaults.activeDotRadius,
                strokeWidth: areaChartDefaults.activeDotStrokeWidth,
                fill: 'white',
              }}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      {data.summary.insights && data.summary.insights.length > 0 && (
        <div className="mt-4 rounded-lg bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('insights')}</p>
          <ul className="mt-1 space-y-1">
            {data.summary.insights.slice(0, 2).map((insight, i) => {
              // Try to translate the insight
              let translatedInsight = insight;
              for (const { pattern, key, extractParams } of insightPatternMap) {
                const match = insight.match(pattern);
                if (match) {
                  const params = extractParams ? extractParams(match) : {};
                  translatedInsight = tInsights(key, params);
                  break;
                }
              }
              return (
                <li key={i} className="text-xs text-foreground">
                  • {translatedInsight}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Confidence Note */}
      <p className="mt-4 text-xs text-muted-foreground">
        {t('basedOnTransactions', {
          transactions: formatNumber(data.dataQuality.transactionsAnalyzed),
          patterns: formatNumber(
            data.dataQuality.recurringExpensesDetected + data.dataQuality.recurringIncomeDetected
          ),
        })}
      </p>
    </div>
  );
}
