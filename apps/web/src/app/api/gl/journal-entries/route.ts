/**
 * Journal Entries API
 *
 * GET /api/gl/journal-entries?workspaceId=xxx - List journal entries
 * POST /api/gl/journal-entries - Create journal entry
 */

import { validateJournalEntry } from '@moneio/core-ledger';
import { prisma, Prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const journalStatusEnum = z.enum(['DRAFT', 'POSTED', 'REVERSED']);

const listQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  status: journalStatusEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

const journalLineSchema = z.object({
  glAccountId: z.string().uuid(),
  description: z.string().max(255).optional(),
  debitAmount: z.number().min(0),
  creditAmount: z.number().min(0),
  currency: z.string().length(3).default('EUR'),
});

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  entryDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  description: z.string().min(1).max(500),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().uuid().optional(),
  lines: z.array(journalLineSchema).min(2),
});

/**
 * Generate next entry number for a workspace
 */
async function generateEntryNumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;

  // Find the last entry number for this year
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
 * GET /api/gl/journal-entries
 * List journal entries for a workspace
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
    const parsed = listQuerySchema.safeParse({
      workspaceId: searchParams.get('workspaceId'),
      status: searchParams.get('status'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, status, startDate, endDate, page, pageSize } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Build where clause
    const where: Prisma.JournalEntryWhereInput = {
      workspaceId,
      ...(status && { status }),
      ...(startDate && { entryDate: { gte: new Date(startDate) } }),
      ...(endDate && { entryDate: { lte: new Date(endDate) } }),
    };

    // If both dates provided, combine them
    if (startDate && endDate) {
      where.entryDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // Get entries with lines
    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { entryNumber: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          lines: {
            orderBy: { lineOrder: 'asc' },
            include: {
              glAccount: {
                select: { id: true, accountCode: true, accountName: true },
              },
            },
          },
        },
      }),
      prisma.journalEntry.count({ where }),
    ]);

    // Transform to response format
    const formatted = entries.map((entry) => {
      const totalDebits = entry.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const totalCredits = entry.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0);

      return {
        id: entry.id,
        entryNumber: entry.entryNumber,
        entryDate: entry.entryDate.toISOString().split('T')[0],
        description: entry.description,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        status: entry.status,
        postedAt: entry.postedAt?.toISOString() || null,
        postedBy: entry.postedBy,
        totalDebits,
        totalCredits,
        lineCount: entry.lines.length,
        lines: entry.lines.map((line) => ({
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
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      entries: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get journal entries:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/gl/journal-entries
 * Create a new journal entry (as DRAFT)
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, entryDate, description, referenceType, referenceId, lines } = parsed.data;

    // Check permission
    const canCreate = await hasPermission(user.id, workspaceId, 'gl:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Validate journal entry (debits = credits)
    const validationLines = lines.map((line, index) => ({
      glAccountId: line.glAccountId,
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
      currency: line.currency,
      lineOrder: index + 1,
    }));

    const validation = validateJournalEntry(validationLines);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Invalid journal entry', details: validation.errors },
        { status: 400 }
      );
    }

    // Validate all accounts exist and are active
    const accountIds = lines.map((l) => l.glAccountId);
    const accounts = await prisma.gLAccount.findMany({
      where: {
        id: { in: accountIds },
        workspaceId,
      },
    });

    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ error: 'One or more GL accounts not found' }, { status: 400 });
    }

    const inactiveAccounts = accounts.filter((a) => !a.isActive);
    if (inactiveAccounts.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot use inactive accounts',
          details: inactiveAccounts.map((a) => a.accountCode),
        },
        { status: 400 }
      );
    }

    // Generate entry number
    const entryNumber = await generateEntryNumber(workspaceId);

    // Create journal entry with lines in transaction
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.journalEntry.create({
        data: {
          workspaceId,
          entryNumber,
          entryDate: new Date(entryDate),
          description,
          referenceType: referenceType || null,
          referenceId: referenceId || null,
          status: 'DRAFT',
        },
      });

      // Create lines
      await tx.journalLine.createMany({
        data: lines.map((line, index) => ({
          journalEntryId: created.id,
          glAccountId: line.glAccountId,
          description: line.description || null,
          debitAmount: new Prisma.Decimal(line.debitAmount),
          creditAmount: new Prisma.Decimal(line.creditAmount),
          currency: line.currency,
          lineOrder: index + 1,
        })),
      });

      return created;
    });

    // Get the full entry with lines
    const fullEntry = await prisma.journalEntry.findUnique({
      where: { id: entry.id },
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
        workspaceId,
        userId: user.id,
        action: 'journal_entry.create',
        entityType: 'journal_entry',
        entityId: entry.id,
        newValue: { entryNumber, entryDate, description, lineCount: lines.length },
      },
    });

    return NextResponse.json(
      {
        id: entry.id,
        entryNumber: entry.entryNumber,
        entryDate: entry.entryDate.toISOString().split('T')[0],
        description: entry.description,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        status: entry.status,
        lines: fullEntry?.lines.map((line) => ({
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
        createdAt: entry.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create journal entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
