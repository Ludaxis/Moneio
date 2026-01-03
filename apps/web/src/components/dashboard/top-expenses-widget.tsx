'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { chartPalette } from '@moneio/ui/lib/chart-theme';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useIsRTL } from '@/hooks/use-direction';
import { useLocaleFormat } from '@/hooks/use-locale-format';
import { useTranslateCategory } from '@/hooks/use-translate-category';

interface ExpenseCategory {
  categoryId: string;
  categoryName: string;
  type: 'income' | 'expense';
  amount: number;
  percentage: number;
  transactionCount: number;
  previousAmount?: number;
}

interface TopExpensesWidgetProps {
  workspaceId: string;
  currency: string;
  startDate?: string;
  endDate?: string;
}

export function TopExpensesWidget({
  workspaceId,
  currency,
  startDate: propStartDate,
  endDate: propEndDate,
}: TopExpensesWidgetProps) {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const { formatCurrency, formatNumber } = useLocaleFormat();
  const translateCategoryHook = useTranslateCategory();

  // Helper function to translate category name
  const translateCategory = (categoryName: string | null): string => {
    if (!categoryName) return tCommon('uncategorized');
    return translateCategoryHook(categoryName) || categoryName;
  };
  const isRTL = useIsRTL();
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const containerRef = useFadeIn({ duration: 0.5, y: 20 }) as React.RefObject<HTMLDivElement>;

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      // Use props if provided, otherwise default to current month
      const now = new Date();
      const startDate =
        propStartDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const endDate = propEndDate || now.toISOString().slice(0, 10);

      const params = new URLSearchParams({
        workspaceId,
        startDate,
        endDate,
      });

      const response = await fetch(`/api/dashboard/metrics?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();

      // Filter and sort expense categories (filter by type='expense')
      const expenseCategories = (data.categoryBreakdown || [])
        .filter((cat: { type: string }) => cat.type === 'expense')
        .sort((a: ExpenseCategory, b: ExpenseCategory) => b.amount - a.amount)
        .slice(0, 5);

      setExpenses(expenseCategories);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, propStartDate, propEndDate]);

  useEffect(() => {
    if (workspaceId) {
      fetchExpenses();
    }
  }, [workspaceId, fetchExpenses]);

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
      <h3 className="font-semibold text-foreground">{t('topExpenses')}</h3>

      {expenses.length === 0 ? (
        <div className="mt-6 text-center py-8">
          <p className="text-sm text-muted-foreground">{t('noExpensesForPeriod')}</p>
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
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: chartPalette[index % chartPalette.length] }}
                    />
                    <span className="text-sm font-medium text-foreground truncate">
                      {translateCategory(expense.categoryName)}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      ({formatNumber(expense.transactionCount)})
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
                        {formatNumber(Math.abs(change), { maximumFractionDigits: 0 })}%
                      </span>
                    )}
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(expense.amount, currency)}
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 group-hover:opacity-80 ${
                      isRTL ? 'ms-auto' : ''
                    }`}
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
            <span className="text-sm font-medium text-muted-foreground">{t('total')}</span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {formatCurrency(
                expenses.reduce((sum, e) => sum + e.amount, 0),
                currency
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
