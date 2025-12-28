/**
 * Trial Balance API
 *
 * GET /api/gl/trial-balance?workspaceId=xxx&asOfDate=yyyy-mm-dd - Generate trial balance
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  asOfDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
});

/**
 * GET /api/gl/trial-balance
 * Generate trial balance as of a specific date
 */
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
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, asOfDate } = parsed.data;

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

    const asOfDateObj = new Date(asOfDate);
    // Set to end of day to include all entries on that date
    asOfDateObj.setHours(23, 59, 59, 999);

    // Get all accounts with their balances from posted journal entries
    const accounts = await prisma.gLAccount.findMany({
      where: {
        workspaceId,
        isActive: true,
      },
      orderBy: { accountCode: 'asc' },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        normalBalance: true,
        journalLines: {
          where: {
            journalEntry: {
              status: 'POSTED',
              entryDate: { lte: asOfDateObj },
            },
          },
          select: {
            debitAmount: true,
            creditAmount: true,
          },
        },
      },
    });

    // Calculate balances for each account
    const rows = accounts.map((account) => {
      const debitTotal = account.journalLines.reduce(
        (sum, line) => sum + Number(line.debitAmount),
        0
      );
      const creditTotal = account.journalLines.reduce(
        (sum, line) => sum + Number(line.creditAmount),
        0
      );

      // Calculate balance based on normal balance
      let debitBalance = 0;
      let creditBalance = 0;

      if (account.normalBalance === 'DEBIT') {
        const balance = debitTotal - creditTotal;
        if (balance >= 0) {
          debitBalance = balance;
        } else {
          creditBalance = Math.abs(balance);
        }
      } else {
        const balance = creditTotal - debitTotal;
        if (balance >= 0) {
          creditBalance = balance;
        } else {
          debitBalance = Math.abs(balance);
        }
      }

      return {
        accountId: account.id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        normalBalance: account.normalBalance,
        debitTotal,
        creditTotal,
        debitBalance: Math.round(debitBalance * 100) / 100,
        creditBalance: Math.round(creditBalance * 100) / 100,
      };
    });

    // Filter out accounts with zero balance (optional, but cleaner)
    const nonZeroRows = rows.filter((r) => r.debitBalance !== 0 || r.creditBalance !== 0);

    // Calculate totals
    const totalDebits = nonZeroRows.reduce((sum, r) => sum + r.debitBalance, 0);
    const totalCredits = nonZeroRows.reduce((sum, r) => sum + r.creditBalance, 0);
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    // Group by account type for summary
    const summary = {
      assets: nonZeroRows.filter((r) => r.accountType === 'ASSET'),
      liabilities: nonZeroRows.filter((r) => r.accountType === 'LIABILITY'),
      equity: nonZeroRows.filter((r) => r.accountType === 'EQUITY'),
      income: nonZeroRows.filter((r) => r.accountType === 'INCOME'),
      expenses: nonZeroRows.filter((r) => r.accountType === 'EXPENSE'),
    };

    return NextResponse.json({
      asOfDate: asOfDate,
      currency: workspace.baseCurrency || 'EUR',
      rows: nonZeroRows,
      totalDebits: Math.round(totalDebits * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      difference: Math.round((totalDebits - totalCredits) * 100) / 100,
      isBalanced,
      summary: {
        assetCount: summary.assets.length,
        assetDebitTotal: summary.assets.reduce((s, r) => s + r.debitBalance, 0),
        assetCreditTotal: summary.assets.reduce((s, r) => s + r.creditBalance, 0),
        liabilityCount: summary.liabilities.length,
        liabilityDebitTotal: summary.liabilities.reduce((s, r) => s + r.debitBalance, 0),
        liabilityCreditTotal: summary.liabilities.reduce((s, r) => s + r.creditBalance, 0),
        equityCount: summary.equity.length,
        equityDebitTotal: summary.equity.reduce((s, r) => s + r.debitBalance, 0),
        equityCreditTotal: summary.equity.reduce((s, r) => s + r.creditBalance, 0),
        incomeCount: summary.income.length,
        incomeDebitTotal: summary.income.reduce((s, r) => s + r.debitBalance, 0),
        incomeCreditTotal: summary.income.reduce((s, r) => s + r.creditBalance, 0),
        expenseCount: summary.expenses.length,
        expenseDebitTotal: summary.expenses.reduce((s, r) => s + r.debitBalance, 0),
        expenseCreditTotal: summary.expenses.reduce((s, r) => s + r.creditBalance, 0),
      },
    });
  } catch (error) {
    console.error('Failed to generate trial balance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
