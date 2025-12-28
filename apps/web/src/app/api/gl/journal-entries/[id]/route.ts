/**
 * Journal Entry API - Individual Entry Operations
 *
 * GET /api/gl/journal-entries/[id] - Get entry details
 * PATCH /api/gl/journal-entries/[id] - Update draft entry
 * DELETE /api/gl/journal-entries/[id] - Delete draft entry
 */

import { validateJournalEntry } from '@moneio/core-ledger';
import { prisma, Prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const journalLineSchema = z.object({
  glAccountId: z.string().uuid(),
  description: z.string().max(255).optional(),
  debitAmount: z.number().min(0),
  creditAmount: z.number().min(0),
  currency: z.string().length(3).default('EUR'),
});

const updateSchema = z.object({
  entryDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    })
    .optional(),
  description: z.string().min(1).max(500).optional(),
  referenceType: z.string().max(50).nullable().optional(),
  referenceId: z.string().uuid().nullable().optional(),
  lines: z.array(journalLineSchema).min(2).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/gl/journal-entries/[id]
 * Get journal entry details with lines
 */
export async function GET(_request: Request, { params }: RouteParams) {
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
          orderBy: { lineOrder: 'asc' },
          include: {
            glAccount: {
              select: {
                id: true,
                accountCode: true,
                accountName: true,
                accountType: true,
                normalBalance: true,
              },
            },
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, entry.workspaceId, 'gl:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const totalDebits = entry.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
    const totalCredits = entry.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0);

    return NextResponse.json({
      id: entry.id,
      entryNumber: entry.entryNumber,
      entryDate: entry.entryDate.toISOString().split('T')[0],
      description: entry.description,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      status: entry.status,
      postedAt: entry.postedAt?.toISOString() || null,
      postedBy: entry.postedBy,
      reversedAt: entry.reversedAt?.toISOString() || null,
      reversedBy: entry.reversedBy,
      totalDebits,
      totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      lines: entry.lines.map((line) => ({
        id: line.id,
        glAccountId: line.glAccountId,
        accountCode: line.glAccount.accountCode,
        accountName: line.glAccount.accountName,
        accountType: line.glAccount.accountType,
        normalBalance: line.glAccount.normalBalance,
        description: line.description,
        debitAmount: Number(line.debitAmount),
        creditAmount: Number(line.creditAmount),
        currency: line.currency,
        lineOrder: line.lineOrder,
      })),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to get journal entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/gl/journal-entries/[id]
 * Update a draft journal entry
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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
      include: { lines: true },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    // Check permission
    const canUpdate = await hasPermission(user.id, entry.workspaceId, 'gl:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Can only update draft entries
    if (entry.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Can only update draft entries. Posted entries must be reversed.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { entryDate, description, referenceType, referenceId, lines } = parsed.data;

    // If updating lines, validate them
    if (lines) {
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
          workspaceId: entry.workspaceId,
        },
      });

      if (accounts.length !== accountIds.length) {
        return NextResponse.json({ error: 'One or more GL accounts not found' }, { status: 400 });
      }

      const inactiveAccounts = accounts.filter((a) => !a.isActive);
      if (inactiveAccounts.length > 0) {
        return NextResponse.json({ error: 'Cannot use inactive accounts' }, { status: 400 });
      }
    }

    const oldValue = {
      entryDate: entry.entryDate.toISOString().split('T')[0],
      description: entry.description,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      lineCount: entry.lines.length,
    };

    // Update in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update entry
      const updatedEntry = await tx.journalEntry.update({
        where: { id },
        data: {
          ...(entryDate && { entryDate: new Date(entryDate) }),
          ...(description && { description }),
          ...(referenceType !== undefined && { referenceType }),
          ...(referenceId !== undefined && { referenceId }),
        },
      });

      // If lines provided, replace all lines
      if (lines) {
        // Delete existing lines
        await tx.journalLine.deleteMany({
          where: { journalEntryId: id },
        });

        // Create new lines
        await tx.journalLine.createMany({
          data: lines.map((line, index) => ({
            journalEntryId: id,
            glAccountId: line.glAccountId,
            description: line.description || null,
            debitAmount: new Prisma.Decimal(line.debitAmount),
            creditAmount: new Prisma.Decimal(line.creditAmount),
            currency: line.currency,
            lineOrder: index + 1,
          })),
        });
      }

      return updatedEntry;
    });

    // Get full entry with lines
    const fullEntry = await prisma.journalEntry.findUnique({
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

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: user.id,
        action: 'journal_entry.update',
        entityType: 'journal_entry',
        entityId: entry.id,
        oldValue,
        newValue: { entryDate, description, referenceType, referenceId, lineCount: lines?.length },
      },
    });

    return NextResponse.json({
      id: updated.id,
      entryNumber: updated.entryNumber,
      entryDate: updated.entryDate.toISOString().split('T')[0],
      description: updated.description,
      referenceType: updated.referenceType,
      referenceId: updated.referenceId,
      status: updated.status,
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
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to update journal entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/gl/journal-entries/[id]
 * Delete a draft journal entry
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
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
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    // Check permission
    const canDelete = await hasPermission(user.id, entry.workspaceId, 'gl:delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Can only delete draft entries
    if (entry.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Can only delete draft entries. Posted entries must be reversed.' },
        { status: 400 }
      );
    }

    // Delete entry (lines will cascade delete)
    await prisma.journalEntry.delete({
      where: { id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: user.id,
        action: 'journal_entry.delete',
        entityType: 'journal_entry',
        entityId: entry.id,
        oldValue: {
          entryNumber: entry.entryNumber,
          entryDate: entry.entryDate.toISOString().split('T')[0],
          description: entry.description,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete journal entry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
