'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { chartPalette } from '@moneio/ui/lib/chart-theme';
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface ExpenseCategory {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  transactionCount: number;
  previousAmount?: number;
}

interface TopExpensesWidgetProps {
  workspaceId: string;
  currency: string;
  period?: 'this_month' | 'last_month' | 'this_quarter' | 'ytd';
}

const periodLabels: Record<string, string> = {
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  ytd: 'Year to Date',
};

export function TopExpensesWidget({
  workspaceId,
  currency,
  period = 'this_month',
}: TopExpensesWidgetProps) {
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [showDropdown, setShowDropdown] = useState(false);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      // Calculate date range based on period
      const now = new Date();
      let startDate: string;
      let endDate = now.toISOString().slice(0, 10);

      switch (selectedPeriod) {
        case 'last_month': {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          startDate = lastMonth.toISOString().slice(0, 10);
          endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
          break;
        }
        case 'this_quarter': {
          const quarterStart = Math.floor(now.getMonth() / 3) * 3;
          startDate = new Date(now.getFullYear(), quarterStart, 1).toISOString().slice(0, 10);
          break;
        }
        case 'ytd':
          startDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
          break;
        default: // this_month
          startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      }

      const params = new URLSearchParams({
        workspaceId,
        startDate,
        endDate,
      });

      const response = await fetch(`/api/dashboard/metrics?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();

      // Filter and sort expense categories
      const expenseCategories = (data.categoryBreakdown || [])
        .filter((cat: ExpenseCategory) => cat.amount < 0)
        .map((cat: ExpenseCategory) => ({
          ...cat,
          amount: Math.abs(cat.amount),
        }))
        .sort((a: ExpenseCategory, b: ExpenseCategory) => b.amount - a.amount)
        .slice(0, 5);

      setExpenses(expenseCategories);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedPeriod]);

  useEffect(() => {
    if (workspaceId) {
      fetchExpenses();
    }
  }, [workspaceId, fetchExpenses]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const maxAmount = expenses.length > 0 ? Math.max(...expenses.map((e) => e.amount)) : 0;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-6 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Top Expenses</h3>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            {periodLabels[selectedPeriod]}
            <ChevronDown className="h-4 w-4" />
          </button>
          {showDropdown && (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-border bg-popover shadow-lg">
              {Object.entries(periodLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedPeriod(key as typeof selectedPeriod);
                    setShowDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    selectedPeriod === key ? 'bg-muted font-medium' : ''
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="mt-6 text-center py-8">
          <p className="text-sm text-muted-foreground">No expenses recorded for this period.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {expenses.map((expense, index) => {
            const percentage = maxAmount > 0 ? (expense.amount / maxAmount) * 100 : 0;
            const change = expense.previousAmount
              ? ((expense.amount - expense.previousAmount) / expense.previousAmount) * 100
              : undefined;

            return (
              <div key={expense.categoryId} className="group">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: chartPalette[index % chartPalette.length] }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {expense.categoryName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({expense.transactionCount} txns)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {change !== undefined && (
                      <span
                        className={`flex items-center text-xs ${
                          change > 0 ? 'text-danger-600' : 'text-success-600'
                        }`}
                      >
                        {change > 0 ? (
                          <TrendingUp className="h-3 w-3 mr-0.5" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-0.5" />
                        )}
                        {Math.abs(change).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 group-hover:opacity-80"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: chartPalette[index % chartPalette.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expenses.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {formatCurrency(expenses.reduce((sum, e) => sum + e.amount, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
