'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface CategoryData {
  categoryId: string;
  categoryName: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  percentage: number;
  transactionCount: number;
}

interface CategoryBreakdownProps {
  data: CategoryData[];
  loading?: boolean;
  baseCurrency: string;
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function CategoryBreakdown({ data, loading, baseCurrency }: CategoryBreakdownProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-64 animate-pulse rounded-full bg-muted mx-auto w-48" />
      </div>
    );
  }

  // Filter to expenses only and sort by amount
  const expenseData = data
    .filter((item) => item.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8); // Top 8 categories

  if (expenseData.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Expenses by Category</h2>
        <div className="mt-4 flex h-64 items-center justify-center">
          <p className="text-muted-foreground">No expense data available</p>
        </div>
      </div>
    );
  }

  const chartData = expenseData.map((item) => ({
    name: item.categoryName || 'Uncategorized',
    value: item.amount,
    transactions: item.transactionCount,
  }));

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Expenses by Category</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value) => [formatCurrency(Number(value) || 0, baseCurrency), 'Amount']}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              formatter={(value: string) => (
                <span className="text-sm text-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
