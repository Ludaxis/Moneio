/**
 * Balance Sheet Report API
 *
 * GET /api/reports/balance-sheet?workspaceId=xxx&asOfDate=YYYY-MM-DD
 *
 * Returns complete Balance Sheet including:
 * - Assets (Current, Fixed, Other)
 * - Liabilities (Current, Long-term)
 * - Equity (Capital, Retained Earnings)
 * - Key financial ratios
 * - Balance verification
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { BalanceSheetService } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createPrismaReportRepository } from '@/lib/repositories/report-repository';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency, transformMoney } from '@/lib/utils/money-transform';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comparative: z.enum(['true', 'false']).optional(),
  previousAsOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
      asOfDate: searchParams.get('asOfDate'),
      comparative: searchParams.get('comparative') || undefined,
      previousAsOfDate: searchParams.get('previousAsOfDate') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, asOfDate, comparative, previousAsOfDate } = parsed.data;

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

    // If no GL accounts, generate simplified Balance Sheet from transactions
    if (glAccountCount === 0) {
      // Get all transactions up to asOfDate to calculate net position
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: {
            lte: new Date(asOfDate),
          },
        },
      });

      // Get bank accounts for cash balances
      const bankAccounts = await prisma.bankAccount.findMany({
        where: { workspaceId },
        select: { id: true, name: true, currentBalance: true },
      });

      // Calculate total cash from bank accounts (currentBalance is Decimal)
      let totalCash = 0;
      const cashItems = bankAccounts.map((account) => {
        const balance = account.currentBalance ? account.currentBalance.toNumber() : 0;
        totalCash += balance;
        return {
          accountId: account.id,
          accountCode: '',
          accountName: account.name,
          balance: {
            amount: balance,
            currency: baseCurrency,
            formatted: formatCurrency(balance, baseCurrency),
          },
          depth: 0,
          isSubtotal: false,
        };
      });

      // Calculate net income from transactions (retained earnings proxy)
      let netIncome = 0;
      for (const tx of transactions) {
        netIncome += tx.amount.toNumber(); // Positive = income, negative = expense
      }

      // Simple balance sheet structure (amounts already in decimal)
      const totalAssets = totalCash;
      const totalLiabilities = 0; // Would need invoice data for accounts payable
      const totalEquity = netIncome; // Simplified: all earnings are equity

      const emptyMoney = {
        amount: 0,
        currency: baseCurrency,
        formatted: formatCurrency(0, baseCurrency),
      };

      return NextResponse.json({
        metadata: {
          generatedAt: new Date().toISOString(),
          workspaceId,
          baseCurrency,
          asOfDate,
        },
        sections: {
          assets: {
            name: 'Assets',
            key: 'assets',
            subsections: [
              {
                name: 'Current Assets',
                key: 'currentAssets',
                items: cashItems.length > 0 ? cashItems : [],
                subtotal: {
                  amount: totalCash,
                  currency: baseCurrency,
                  formatted: formatCurrency(totalCash, baseCurrency),
                },
              },
            ],
            total: {
              amount: totalAssets,
              currency: baseCurrency,
              formatted: formatCurrency(totalAssets, baseCurrency),
            },
          },
          liabilities: {
            name: 'Liabilities',
            key: 'liabilities',
            subsections: [],
            total: emptyMoney,
          },
          equity: {
            name: 'Equity',
            key: 'equity',
            subsections: [
              {
                name: 'Retained Earnings',
                key: 'retainedEarnings',
                items: [
                  {
                    accountId: 'retained-earnings',
                    accountCode: '',
                    accountName: 'Net Income (YTD)',
                    balance: {
                      amount: netIncome,
                      currency: baseCurrency,
                      formatted: formatCurrency(netIncome, baseCurrency),
                    },
                    depth: 0,
                    isSubtotal: false,
                  },
                ],
                subtotal: {
                  amount: netIncome,
                  currency: baseCurrency,
                  formatted: formatCurrency(netIncome, baseCurrency),
                },
              },
            ],
            total: {
              amount: totalEquity,
              currency: baseCurrency,
              formatted: formatCurrency(totalEquity, baseCurrency),
            },
          },
        },
        summaries: {
          totalAssets: {
            amount: totalAssets,
            currency: baseCurrency,
            formatted: formatCurrency(totalAssets, baseCurrency),
          },
          totalLiabilities: emptyMoney,
          totalEquity: {
            amount: totalEquity,
            currency: baseCurrency,
            formatted: formatCurrency(totalEquity, baseCurrency),
          },
          totalLiabilitiesAndEquity: {
            amount: totalEquity,
            currency: baseCurrency,
            formatted: formatCurrency(totalEquity, baseCurrency),
          },
          isBalanced: Math.abs(totalAssets - totalEquity) < 0.01, // Allow 1 cent tolerance
          difference: {
            amount: totalAssets - totalEquity,
            currency: baseCurrency,
            formatted: formatCurrency(totalAssets - totalEquity, baseCurrency),
          },
        },
        ratios: {
          currentRatio: totalLiabilities > 0 ? totalAssets / totalLiabilities : 0,
          quickRatio: totalLiabilities > 0 ? totalAssets / totalLiabilities : 0,
          debtToEquity: totalEquity > 0 ? totalLiabilities / totalEquity : 0,
        },
        _simplified: true,
        _notice:
          'Simplified Balance Sheet generated from bank accounts. Set up Chart of Accounts for detailed reports.',
      });
    }

    // Create repository and service
    const repository = createPrismaReportRepository(prisma);
    const service = new BalanceSheetService(repository);

    // Build input
    const input = {
      workspaceId,
      asOfDate,
      baseCurrency,
      options: {
        comparative: comparative === 'true',
      },
      previousAsOfDate: comparative === 'true' ? previousAsOfDate : undefined,
    };

    // Generate report
    const report = await service.generate(input);

    // Transform for JSON response
    const transformSubsection = (subsection: (typeof report.sections.assets.subsections)[0]) => ({
      name: subsection.name,
      key: subsection.key,
      items: subsection.items.map((item) => ({
        accountId: item.accountId,
        accountCode: item.accountCode,
        accountName: item.accountName,
        balance: transformMoney(item.balance),
        previousBalance: item.previousBalance ? transformMoney(item.previousBalance) : undefined,
        change: item.change ? transformMoney(item.change) : undefined,
        changePercentage: item.changePercentage,
        depth: item.depth,
        isSubtotal: item.isSubtotal,
      })),
      subtotal: transformMoney(subsection.subtotal),
      previousSubtotal: subsection.previousSubtotal
        ? transformMoney(subsection.previousSubtotal)
        : undefined,
    });

    const transformSection = (section: typeof report.sections.assets) => ({
      name: section.name,
      key: section.key,
      subsections: section.subsections.map(transformSubsection),
      total: transformMoney(section.total),
      previousTotal: section.previousTotal ? transformMoney(section.previousTotal) : undefined,
    });

    return NextResponse.json({
      metadata: report.metadata,
      sections: {
        assets: transformSection(report.sections.assets),
        liabilities: transformSection(report.sections.liabilities),
        equity: transformSection(report.sections.equity),
      },
      summaries: {
        totalAssets: transformMoney(report.summaries.totalAssets),
        totalLiabilities: transformMoney(report.summaries.totalLiabilities),
        totalEquity: transformMoney(report.summaries.totalEquity),
        totalLiabilitiesAndEquity: transformMoney(report.summaries.totalLiabilitiesAndEquity),
        isBalanced: report.summaries.isBalanced,
        difference: transformMoney(report.summaries.difference),
      },
      ratios: report.ratios
        ? {
            currentRatio: report.ratios.currentRatio,
            quickRatio: report.ratios.quickRatio,
            debtToEquity: report.ratios.debtToEquity,
            workingCapital: report.ratios.workingCapital
              ? transformMoney(report.ratios.workingCapital)
              : undefined,
          }
        : undefined,
    });
  } catch (error) {
    console.error('Failed to generate balance sheet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
