/**
 * Journal Entry Post API
 *
 * POST /api/gl/journal-entries/[id]/post - Post a draft journal entry
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/gl/journal-entries/[id]/post
 * Post a draft journal entry (changes status to POSTED)
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            glAccount: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    // Check permission - requires gl:post permission
    const canPost = await hasPermission(user.id, entry.workspaceId, 'gl:post');
    if (!canPost) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Can only post draft entries
    if (entry.status !== 'DRAFT') {
      return NextResponse.json(
        { error: `Cannot post entry with status ${entry.status}` },
        { status: 400 }
      );
    }

    // Verify entry is balanced
    const totalDebits = entry.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
    const totalCredits = entry.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return NextResponse.json(
        {
          error: 'Entry is not balanced',
          details: { totalDebits, totalCredits, difference: totalDebits - totalCredits },
        },
        { status: 400 }
      );
    }

    // Verify all accounts are still active
    const inactiveAccounts = entry.lines.filter((l) => !l.glAccount.isActive);
    if (inactiveAccounts.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot post entry with inactive accounts',
          details: inactiveAccounts.map((l) => l.glAccount.accountCode),
        },
        { status: 400 }
      );
    }

    // Check if entry date is in an open period
    const entryDate = entry.entryDate;
    const period = await prisma.accountingPeriod.findFirst({
      where: {
        workspaceId: entry.workspaceId,
        periodStart: { lte: entryDate },
        periodEnd: { gte: entryDate },
      },
    });

    if (period && period.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Cannot post to ${period.status.toLowerCase()} period: ${period.periodName}` },
        { status: 400 }
      );
    }

    // Post the entry
    const posted = await prisma.journalEntry.update({
      where: { id },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
        postedBy: user.id,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: user.id,
        action: 'journal_entry.post',
        entityType: 'journal_entry',
        entityId: entry.id,
        newValue: {
          entryNumber: entry.entryNumber,
          totalDebits,
          totalCredits,
          postedAt: posted.postedAt?.toISOString(),
        },
      },
    });

    return NextResponse.json({
      id: posted.id,
      entryNumber: posted.entryNumber,
      entryDate: posted.entryDate.toISOString().split('T')[0],
      description: posted.description,
      status: posted.status,
      postedAt: posted.postedAt?.toISOString(),
      postedBy: posted.postedBy,
      totalDebits,
      totalCredits,
    });
  } catch (error) {
    console.error('Failed to post journal entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
