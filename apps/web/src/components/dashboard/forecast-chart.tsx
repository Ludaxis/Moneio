'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { tooltipStyle, axisStyle, gridStyle, chartPalette } from '@moneio/ui/lib/chart-theme';
import { AlertCircle, TrendingUp, Calendar } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
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

interface ForecastMonth {
  month: string;
  monthLabel: string;
  projectedIncome: number;
  projectedExpenses: number;
  projectedNet: number;
  endingCash: number;
  confidence: number;
}

interface ForecastSummary {
  startingCash: number;
  endingCash: number;
  totalProjectedIncome: number;
  totalProjectedExpenses: number;
  averageMonthlyNet: number;
  lowestCashPoint: { month: string; amount: number };
  cashRunway: { months: number; status: string };
}

interface ForecastData {
  forecast: ForecastMonth[];
  summary: ForecastSummary;
  currency: string;
  generatedAt: string;
}

interface ForecastChartProps {
  workspaceId: string;
  months?: number;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ForecastChart({ workspaceId, months = 6 }: ForecastChartProps) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Cash Flow Forecast</h2>
        <div className="mt-4 flex items-center gap-2 text-sm text-danger-600">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data || !data.forecast || data.forecast.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Cash Flow Forecast</h2>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Not enough data to generate a forecast.
            <br />
            Add more transactions to see projections.
          </p>
        </div>
      </div>
    );
  }

  const runwayStatusColors: Record<string, string> = {
    critical: 'text-danger-600 bg-danger-50',
    warning: 'text-orange-600 bg-orange-50',
    healthy: 'text-success-600 bg-success-50',
    excellent: 'text-chart-income bg-green-50',
  };

  return (
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Cash Flow Forecast</h2>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{months} months</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Starting Cash</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(data.summary.startingCash, data.currency)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Projected End</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(data.summary.endingCash, data.currency)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Avg Monthly Net</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              data.summary.averageMonthlyNet >= 0 ? 'text-chart-income' : 'text-chart-expense'
            }`}
          >
            {formatCurrency(data.summary.averageMonthlyNet, data.currency)}
          </p>
        </div>
        <div className={`rounded-lg p-3 ${runwayStatusColors[data.summary.cashRunway.status]}`}>
          <p className="text-xs opacity-80">Cash Runway</p>
          <p className="mt-1 text-lg font-semibold">{data.summary.cashRunway.months}+ months</p>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-6 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.forecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartPalette[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartPalette[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="monthLabel" tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatCurrency(value, data.currency)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                const labels: Record<string, string> = {
                  endingCash: 'Ending Cash',
                  projectedIncome: 'Income',
                  projectedExpenses: 'Expenses',
                };
                return [
                  formatCurrency(Number(value) || 0, data.currency),
                  labels[String(name)] || String(name),
                ];
              }}
            />
            {/* Zero line */}
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            {/* Lowest cash point marker */}
            {data.summary.lowestCashPoint && (
              <ReferenceLine
                y={data.summary.lowestCashPoint.amount}
                stroke="#f87171"
                strokeDasharray="5 5"
                label={{
                  value: 'Lowest',
                  position: 'right',
                  fill: '#f87171',
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="endingCash"
              name="Ending Cash"
              stroke={chartPalette[0]}
              strokeWidth={2}
              fill="url(#cashGradient)"
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence Note */}
      <p className="mt-4 text-xs text-muted-foreground">
        Forecast based on historical patterns and recurring transactions. Confidence decreases for
        months further in the future.
      </p>
    </div>
  );
}
