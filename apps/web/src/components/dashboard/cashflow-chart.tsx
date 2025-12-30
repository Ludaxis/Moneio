'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { chartColors, axisStyle, gridStyle, areaChartDefaults } from '@moneio/ui/lib/chart-theme';
import { ChartTooltip, chartTooltipContentStyle } from '@moneio/ui/patterns';
import type React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface MonthlyData {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  netCashflow: number;
}

interface CashflowChartProps {
  data: MonthlyData[];
  loading?: boolean;
  baseCurrency: string;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function CashflowChart({ data, loading, baseCurrency }: CashflowChartProps) {
  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Cashflow</h2>
      <div className="mt-4 h-64 min-h-[256px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartColors.income}
                  stopOpacity={areaChartDefaults.fillOpacity}
                />
                <stop offset="95%" stopColor={chartColors.income} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={chartColors.expense}
                  stopOpacity={areaChartDefaults.fillOpacity}
                />
                <stop offset="95%" stopColor={chartColors.expense} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis dataKey="monthLabel" tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatCurrency(value, baseCurrency)}
              width={80}
            />
            <Tooltip
              content={<ChartTooltip currency={baseCurrency} formatLabel={(label) => label} />}
              contentStyle={chartTooltipContentStyle}
            />
            <Area
              type="monotone"
              dataKey="income"
              name="Income"
              stroke={chartColors.income}
              strokeWidth={areaChartDefaults.strokeWidth}
              fill="url(#incomeGradient)"
              dot={false}
              activeDot={{
                r: areaChartDefaults.activeDotRadius,
                strokeWidth: areaChartDefaults.activeDotStrokeWidth,
                fill: 'white',
              }}
              animationDuration={500}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke={chartColors.expense}
              strokeWidth={areaChartDefaults.strokeWidth}
              fill="url(#expenseGradient)"
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
      {/* Custom legend */}
      <div className="mt-4 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-chart-income" />
          <span className="text-muted-foreground">Income</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-chart-expense" />
          <span className="text-muted-foreground">Expenses</span>
        </div>
      </div>
    </div>
  );
}
