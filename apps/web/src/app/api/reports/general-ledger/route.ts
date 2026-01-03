/**
 * General Ledger Detail Report API
 *
 * GET /api/reports/general-ledger?workspaceId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns detailed GL report including:
 * - All transactions by account
 * - Running balances
 * - Opening and closing balances
 * - Optional filtering by account IDs or types
 */

import type { CurrencyCode } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { GLDetailService } from '@moneio/domain';
import type { AccountType } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createPrismaReportRepository } from '@/lib/repositories/report-repository';
import { createServerClient } from '@/lib/supabase';
import { transformMoney } from '@/lib/utils/money-transform';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountIds: z.string().optional(), // Comma-separated UUIDs
  accountTypes: z.string().optional(), // Comma-separated types: ASSET,LIABILITY,EQUITY,INCOME,EXPENSE
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
      accountIds: searchParams.get('accountIds') || undefined,
      accountTypes: searchParams.get('accountTypes') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, startDate, endDate, accountIds, accountTypes } = parsed.data;

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

    // If no GL accounts, generate simplified GL from transactions grouped by category
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
        orderBy: { postedAt: 'asc' },
      });

      // Group transactions by category
      const categoryMap: Record<
        string,
        {
          name: string;
          type: string;
          entries: Array<{
            id: string;
            postedAt: Date;
            description: string | null;
            amount: number;
          }>;
          totalDebits: number;
          totalCredits: number;
        }
      > = {};

      for (const tx of transactions) {
        const categorization = tx.categorizations[0];
        const categoryId = categorization?.category?.id || 'uncategorized';
        const categoryName = categorization?.category?.name || 'Uncategorized';
        const amountNum = tx.amount.toNumber();
        const categoryType = amountNum > 0 ? 'INCOME' : 'EXPENSE';

        if (!categoryMap[categoryId]) {
          categoryMap[categoryId] = {
            name: categoryName,
            type: categoryType,
            entries: [],
            totalDebits: 0,
            totalCredits: 0,
          };
        }

        categoryMap[categoryId].entries.push({
          id: tx.id,
          postedAt: tx.postedAt,
          description: tx.description,
          amount: amountNum,
        });
        if (amountNum > 0) {
          categoryMap[categoryId].totalCredits += amountNum;
        } else {
          categoryMap[categoryId].totalDebits += Math.abs(amountNum);
        }
      }

      // Helper for currency formatting
      const formatCurrencyValue = (amount: number) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: baseCurrency,
        }).format(amount);

      // Build accounts from categories
      const accounts = Object.entries(categoryMap).map(([categoryId, data]) => {
        let runningBalance = 0;
        const entries = data.entries.map((tx, idx) => {
          const isDebit = tx.amount < 0;
          const amount = Math.abs(tx.amount);
          runningBalance += tx.amount;

          return {
            entryId: tx.id,
            entryNumber: `TX-${String(idx + 1).padStart(4, '0')}`,
            entryDate: tx.postedAt.toISOString().split('T')[0],
            description: tx.description || 'Transaction',
            referenceType: 'TRANSACTION',
            referenceId: tx.id,
            debit: {
              amount: isDebit ? amount : 0,
              currency: baseCurrency,
              formatted: formatCurrencyValue(isDebit ? amount : 0),
            },
            credit: {
              amount: !isDebit ? amount : 0,
              currency: baseCurrency,
              formatted: formatCurrencyValue(!isDebit ? amount : 0),
            },
            runningBalance: {
              amount: runningBalance,
              currency: baseCurrency,
              formatted: formatCurrencyValue(runningBalance),
            },
          };
        });

        return {
          accountId: categoryId,
          accountCode: '',
          accountName: data.name,
          accountType: data.type,
          openingBalance: {
            amount: 0,
            currency: baseCurrency,
            formatted: formatCurrencyValue(0),
          },
          entries,
          totalDebits: {
            amount: data.totalDebits,
            currency: baseCurrency,
            formatted: formatCurrencyValue(data.totalDebits),
          },
          totalCredits: {
            amount: data.totalCredits,
            currency: baseCurrency,
            formatted: formatCurrencyValue(data.totalCredits),
          },
          closingBalance: {
            amount: runningBalance,
            currency: baseCurrency,
            formatted: formatCurrencyValue(runningBalance),
          },
        };
      });

      // Calculate totals
      const totalDebits = Object.values(categoryMap).reduce((sum, c) => sum + c.totalDebits, 0);
      const totalCredits = Object.values(categoryMap).reduce((sum, c) => sum + c.totalCredits, 0);

      return NextResponse.json({
        metadata: {
          generatedAt: new Date().toISOString(),
          workspaceId,
          baseCurrency,
          period: { start: startDate, end: endDate },
        },
        accounts,
        summary: {
          totalDebits: {
            amount: totalDebits,
            currency: baseCurrency,
            formatted: formatCurrencyValue(totalDebits),
          },
          totalCredits: {
            amount: totalCredits,
            currency: baseCurrency,
            formatted: formatCurrencyValue(totalCredits),
          },
          accountCount: accounts.length,
          entryCount: transactions.length,
        },
        _simplified: true,
        _notice:
          'Simplified GL generated from transactions by category. Set up Chart of Accounts for proper double-entry accounting.',
      });
    }

    // Parse optional filters
    const accountIdList = accountIds?.split(',').filter(Boolean);
    const accountTypeList = accountTypes?.split(',').filter(Boolean) as AccountType[] | undefined;

    // Create repository and service
    const repository = createPrismaReportRepository(prisma);
    const service = new GLDetailService(repository);

    // Generate report
    const report = await service.generate({
      workspaceId,
      startDate,
      endDate,
      baseCurrency,
      accountIds: accountIdList,
      accountTypes: accountTypeList,
    });

    // Transform for JSON response
    return NextResponse.json({
      metadata: report.metadata,
      accounts: report.accounts.map((account) => ({
        accountId: account.accountId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        openingBalance: transformMoney(account.openingBalance),
        entries: account.entries.map((entry) => ({
          entryId: entry.entryId,
          entryNumber: entry.entryNumber,
          entryDate: entry.entryDate,
          description: entry.description,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          debit: transformMoney(entry.debit),
          credit: transformMoney(entry.credit),
          runningBalance: transformMoney(entry.runningBalance),
        })),
        totalDebits: transformMoney(account.totalDebits),
        totalCredits: transformMoney(account.totalCredits),
        closingBalance: transformMoney(account.closingBalance),
      })),
      summary: {
        totalDebits: transformMoney(report.summary.totalDebits),
        totalCredits: transformMoney(report.summary.totalCredits),
        accountCount: report.summary.accountCount,
        entryCount: report.summary.entryCount,
      },
    });
  } catch (error) {
    console.error('Failed to generate general ledger report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
