/**
 * Profit & Loss Report API
 *
 * GET /api/reports/profit-loss?workspaceId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns complete P&L statement including:
 * - Revenue, COGS, Operating Expenses breakdown
 * - Gross Profit, Operating Income, Net Income
 * - Optional comparative period analysis
 * - Monthly breakdown for charts
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { ProfitLossService } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createPrismaReportRepository } from '@/lib/repositories/report-repository';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency, transformMoney } from '@/lib/utils/money-transform';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comparative: z.enum(['true', 'false']).optional(),
  previousStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  previousEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  monthlyBreakdown: z.enum(['true', 'false']).optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      comparative: searchParams.get('comparative') || undefined,
      previousStartDate: searchParams.get('previousStartDate') || undefined,
      previousEndDate: searchParams.get('previousEndDate') || undefined,
      monthlyBreakdown: searchParams.get('monthlyBreakdown') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      workspaceId,
      startDate,
      endDate,
      comparative,
      previousStartDate,
      previousEndDate,
      monthlyBreakdown,
    } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get workspace for base currency
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { baseCurrency: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const baseCurrency = workspace.baseCurrency as CurrencyCode;

    // Check if GL accounts exist
    const glAccountCount = await prisma.gLAccount.count({
      where: { workspaceId, isActive: true },
    });

    // If no GL accounts, generate simplified P&L from transactions
    if (glAccountCount === 0) {
      // Get transactions with categories for the period
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });

      // Calculate totals from transactions
      let totalIncome = 0;
      let totalExpenses = 0;
      const incomeByCategory: Record<string, { name: string; amount: number }> = {};
      const expenseByCategory: Record<string, { name: string; amount: number }> = {};

      for (const tx of transactions) {
        const amountNum = tx.amount.toNumber();
        const amount = Math.abs(amountNum);
        const categorization = tx.categorizations[0];
        const categoryName = categorization?.category?.name || 'Uncategorized';
        const categoryId = categorization?.category?.id || 'uncategorized';

        if (amountNum > 0) {
          // Income
          totalIncome += amount;
          if (!incomeByCategory[categoryId]) {
            incomeByCategory[categoryId] = { name: categoryName, amount: 0 };
          }
          incomeByCategory[categoryId].amount += amount;
        } else {
          // Expense
          totalExpenses += amount;
          if (!expenseByCategory[categoryId]) {
            expenseByCategory[categoryId] = { name: categoryName, amount: 0 };
          }
          expenseByCategory[categoryId].amount += amount;
        }
      }

      // Amounts are already in decimal format from Prisma Decimal
      const incomeDecimal = totalIncome;
      const expensesDecimal = totalExpenses;
      const netIncomeDecimal = incomeDecimal - expensesDecimal;

      // Build revenue items from income categories (amounts already in decimal)
      const revenueItems = Object.entries(incomeByCategory).map(([id, { name, amount }]) => ({
        accountId: id,
        accountCode: '',
        accountName: name,
        amount: {
          amount: amount,
          currency: baseCurrency,
          formatted: formatCurrency(amount, baseCurrency),
        },
        depth: 0,
        isSubtotal: false,
      }));

      // Build expense items from expense categories (amounts already in decimal)
      const expenseItems = Object.entries(expenseByCategory).map(([id, { name, amount }]) => ({
        accountId: id,
        accountCode: '',
        accountName: name,
        amount: {
          amount: amount,
          currency: baseCurrency,
          formatted: formatCurrency(amount, baseCurrency),
        },
        depth: 0,
        isSubtotal: false,
      }));

      const emptySection = {
        name: '',
        key: '',
        items: [],
        subtotal: { amount: 0, currency: baseCurrency, formatted: formatCurrency(0, baseCurrency) },
      };

      return NextResponse.json({
        metadata: {
          generatedAt: new Date().toISOString(),
          workspaceId,
          baseCurrency,
          period: { start: startDate, end: endDate },
        },
        sections: {
          revenue: {
            name: 'Revenue',
            key: 'revenue',
            items: revenueItems,
            subtotal: {
              amount: incomeDecimal,
              currency: baseCurrency,
              formatted: formatCurrency(incomeDecimal, baseCurrency),
            },
          },
          costOfGoodsSold: { ...emptySection, name: 'Cost of Goods Sold', key: 'cogs' },
          operatingExpenses: {
            name: 'Operating Expenses',
            key: 'operatingExpenses',
            items: expenseItems,
            subtotal: {
              amount: expensesDecimal,
              currency: baseCurrency,
              formatted: formatCurrency(expensesDecimal, baseCurrency),
            },
          },
          otherIncome: { ...emptySection, name: 'Other Income', key: 'otherIncome' },
          otherExpenses: { ...emptySection, name: 'Other Expenses', key: 'otherExpenses' },
        },
        summaries: {
          grossProfit: {
            amount: incomeDecimal,
            currency: baseCurrency,
            formatted: formatCurrency(incomeDecimal, baseCurrency),
          },
          operatingIncome: {
            amount: netIncomeDecimal,
            currency: baseCurrency,
            formatted: formatCurrency(netIncomeDecimal, baseCurrency),
          },
          netIncome: {
            amount: netIncomeDecimal,
            currency: baseCurrency,
            formatted: formatCurrency(netIncomeDecimal, baseCurrency),
          },
        },
        monthlyBreakdown: [],
        _simplified: true,
        _notice:
          'Simplified P&L generated from transactions. Set up Chart of Accounts for detailed reports.',
      });
    }

    // Create repository and service
    const repository = createPrismaReportRepository(prisma);
    const service = new ProfitLossService(repository);

    // Build input
    const input = {
      workspaceId,
      startDate,
      endDate,
      baseCurrency,
      options: {
        comparative: comparative === 'true',
        groupBy: monthlyBreakdown === 'true' ? ('month' as const) : undefined,
      },
      previousPeriod:
        comparative === 'true' && previousStartDate && previousEndDate
          ? { start: previousStartDate, end: previousEndDate }
          : undefined,
    };

    // Generate report
    const report = await service.generate(input);

    // Transform for JSON response
    const transformSection = (section: typeof report.sections.revenue) => ({
      name: section.name,
      key: section.key,
      items: section.items.map((item) => ({
        accountId: item.accountId,
        accountCode: item.accountCode,
        accountName: item.accountName,
        amount: transformMoney(item.amount),
        previousAmount: item.previousAmount ? transformMoney(item.previousAmount) : undefined,
        change: item.change ? transformMoney(item.change) : undefined,
        changePercentage: item.changePercentage,
        depth: item.depth,
        isSubtotal: item.isSubtotal,
      })),
      subtotal: transformMoney(section.subtotal),
      previousSubtotal: section.previousSubtotal
        ? transformMoney(section.previousSubtotal)
        : undefined,
    });

    return NextResponse.json({
      metadata: report.metadata,
      sections: {
        revenue: transformSection(report.sections.revenue),
        costOfGoodsSold: transformSection(report.sections.costOfGoodsSold),
        operatingExpenses: transformSection(report.sections.operatingExpenses),
        otherIncome: transformSection(report.sections.otherIncome),
        otherExpenses: transformSection(report.sections.otherExpenses),
      },
      summaries: {
        grossProfit: transformMoney(report.summaries.grossProfit),
        operatingIncome: transformMoney(report.summaries.operatingIncome),
        netIncome: transformMoney(report.summaries.netIncome),
        previousGrossProfit: report.summaries.previousGrossProfit
          ? transformMoney(report.summaries.previousGrossProfit)
          : undefined,
        previousOperatingIncome: report.summaries.previousOperatingIncome
          ? transformMoney(report.summaries.previousOperatingIncome)
          : undefined,
        previousNetIncome: report.summaries.previousNetIncome
          ? transformMoney(report.summaries.previousNetIncome)
          : undefined,
      },
      monthlyBreakdown: report.monthlyBreakdown,
    });
  } catch (error) {
    console.error('Failed to generate P&L report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
