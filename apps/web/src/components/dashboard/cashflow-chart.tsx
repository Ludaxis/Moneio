'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import {
  chartColors,
  tooltipStyle,
  axisStyle,
  gridStyle,
} from '@moneio/ui/lib/chart-theme';
import type React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
    <div ref={containerRef} className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Cashflow</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.income} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColors.income} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColors.expense} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColors.expense} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridStyle} />
            <XAxis
              dataKey="monthLabel"
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatCurrency(value, baseCurrency)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [
                formatCurrency(Number(value) || 0, baseCurrency),
                name === 'income' ? 'Income' : 'Expenses',
              ]}
              labelFormatter={(label) => `Month: ${label}`}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="income"
              name="Income"
              stroke={chartColors.income}
              strokeWidth={2}
              fill="url(#incomeGradient)"
              animationDuration={500}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke={chartColors.expense}
              strokeWidth={2}
              fill="url(#expenseGradient)"
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
