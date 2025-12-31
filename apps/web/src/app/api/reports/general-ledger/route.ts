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
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountIds: z.string().optional(), // Comma-separated UUIDs
  accountTypes: z.string().optional(), // Comma-separated types: ASSET,LIABILITY,EQUITY,INCOME,EXPENSE
});

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function transformMoney(money: { amount: number; currency: string }) {
  return {
    amount: money.amount,
    currency: money.currency,
    formatted: formatCurrency(money.amount, money.currency),
  };
}

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
