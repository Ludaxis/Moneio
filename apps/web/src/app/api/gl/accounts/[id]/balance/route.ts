/**
 * GL Account Balance API
 *
 * GET /api/gl/accounts/[id]/balance - Get account balance as of a date
 */

import { calculateBalance } from '@moneio/core-ledger';
import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  asOfDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/gl/accounts/[id]/balance
 * Get account balance as of a specific date
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      asOfDate: searchParams.get('asOfDate'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { asOfDate } = parsed.data;

    const account = await prisma.gLAccount.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, account.workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const asOfDateObj = new Date(asOfDate);
    asOfDateObj.setHours(23, 59, 59, 999);

    // Get all journal lines for this account from posted entries up to asOfDate
    const journalLines = await prisma.journalLine.findMany({
      where: {
        glAccountId: id,
        journalEntry: {
          status: 'POSTED',
          entryDate: { lte: asOfDateObj },
        },
      },
      select: {
        debitAmount: true,
        creditAmount: true,
      },
    });

    const debitTotal = journalLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
    const creditTotal = journalLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);

    const balance = calculateBalance(debitTotal, creditTotal, account.normalBalance);

    // Get workspace for currency
    const workspace = await prisma.workspace.findUnique({
      where: { id: account.workspaceId },
      select: { baseCurrency: true },
    });

    return NextResponse.json({
      accountId: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      asOfDate: asOfDate,
      debitTotal: Math.round(debitTotal * 100) / 100,
      creditTotal: Math.round(creditTotal * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      currency: workspace?.baseCurrency || 'EUR',
      transactionCount: journalLines.length,
    });
  } catch (error) {
    console.error('Failed to get account balance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
