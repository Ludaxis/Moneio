/**
 * Journal Entry Reverse API
 *
 * POST /api/gl/journal-entries/[id]/reverse - Reverse a posted journal entry
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const reverseSchema = z.object({
  reversalDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  description: z.string().max(500).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Generate next entry number for a workspace
 */
async function generateEntryNumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;

  const lastEntry = await prisma.journalEntry.findFirst({
    where: {
      workspaceId,
      entryNumber: { startsWith: prefix },
    },
    orderBy: { entryNumber: 'desc' },
    select: { entryNumber: true },
  });

  let nextNum = 1;
  if (lastEntry) {
    const lastNum = parseInt(lastEntry.entryNumber.replace(prefix, ''), 10);
    nextNum = lastNum + 1;
  }

  return `${prefix}${nextNum.toString().padStart(5, '0')}`;
}

/**
 * POST /api/gl/journal-entries/[id]/reverse
 * Create a reversing entry for a posted journal entry
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = reverseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reversalDate, description } = parsed.data;

    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { lineOrder: 'asc' },
          include: {
            glAccount: {
              select: { accountCode: true, accountName: true },
            },
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    // Check permission - requires gl:post permission to reverse
    const canPost = await hasPermission(user.id, entry.workspaceId, 'gl:post');
    if (!canPost) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Can only reverse posted entries
    if (entry.status !== 'POSTED') {
      return NextResponse.json(
        { error: `Cannot reverse entry with status ${entry.status}` },
        { status: 400 }
      );
    }

    // Check if reversal date is in an open period
    const reversalDateObj = new Date(reversalDate);
    const period = await prisma.accountingPeriod.findFirst({
      where: {
        workspaceId: entry.workspaceId,
        periodStart: { lte: reversalDateObj },
        periodEnd: { gte: reversalDateObj },
      },
    });

    if (period && period.status !== 'OPEN') {
      return NextResponse.json(
        {
          error: `Cannot post reversal to ${period.status.toLowerCase()} period: ${period.periodName}`,
        },
        { status: 400 }
      );
    }

    // Generate entry number for reversing entry
    const reversalEntryNumber = await generateEntryNumber(entry.workspaceId);

    // Create reversing entry in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Mark original entry as reversed
      await tx.journalEntry.update({
        where: { id },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedBy: user.id,
        },
      });

      // Create reversing entry (debits become credits, credits become debits)
      const reversalEntry = await tx.journalEntry.create({
        data: {
          workspaceId: entry.workspaceId,
          entryNumber: reversalEntryNumber,
          entryDate: reversalDateObj,
          description: description || `Reversal of ${entry.entryNumber}: ${entry.description}`,
          referenceType: 'reversal',
          referenceId: entry.id,
          status: 'POSTED',
          postedAt: new Date(),
          postedBy: user.id,
        },
      });

      // Create reversed lines (swap debit/credit amounts)
      await tx.journalLine.createMany({
        data: entry.lines.map((line) => ({
          journalEntryId: reversalEntry.id,
          glAccountId: line.glAccountId,
          description: `Reversal: ${line.description || ''}`.trim(),
          debitAmount: line.creditAmount, // Swap
          creditAmount: line.debitAmount, // Swap
          currency: line.currency,
          lineOrder: line.lineOrder,
        })),
      });

      return reversalEntry;
    });

    // Get full reversal entry with lines
    const fullReversal = await prisma.journalEntry.findUnique({
      where: { id: result.id },
      include: {
        lines: {
          orderBy: { lineOrder: 'asc' },
          include: {
            glAccount: {
              select: { accountCode: true, accountName: true },
            },
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: user.id,
        action: 'journal_entry.reverse',
        entityType: 'journal_entry',
        entityId: entry.id,
        newValue: {
          originalEntryNumber: entry.entryNumber,
          reversalEntryNumber,
          reversalDate,
        },
      },
    });

    const totalDebits =
      fullReversal?.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0) || 0;
    const totalCredits =
      fullReversal?.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0) || 0;

    return NextResponse.json({
      originalEntry: {
        id: entry.id,
        entryNumber: entry.entryNumber,
        status: 'REVERSED',
      },
      reversalEntry: {
        id: result.id,
        entryNumber: result.entryNumber,
        entryDate: result.entryDate.toISOString().split('T')[0],
        description: result.description,
        status: result.status,
        postedAt: result.postedAt?.toISOString(),
        totalDebits,
        totalCredits,
        lines: fullReversal?.lines.map((line) => ({
          id: line.id,
          glAccountId: line.glAccountId,
          accountCode: line.glAccount.accountCode,
          accountName: line.glAccount.accountName,
          description: line.description,
          debitAmount: Number(line.debitAmount),
          creditAmount: Number(line.creditAmount),
          currency: line.currency,
          lineOrder: line.lineOrder,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to reverse journal entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
