'use client';

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
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Cashflow</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatCurrency(value, baseCurrency)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
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
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#incomeGradient)"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#expenseGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
