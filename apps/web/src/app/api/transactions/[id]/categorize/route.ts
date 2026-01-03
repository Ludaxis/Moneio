/**
 * Transaction Categorization API
 *
 * POST /api/transactions/[id]/categorize - Approve category for transaction
 * DELETE /api/transactions/[id]/categorize - Reject category suggestion
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { postTransactionToGL } from '@/lib/services/gl-posting';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const approveSchema = z.object({
  workspaceId: z.string().uuid(),
  categoryId: z.string().uuid(),
  suggestionId: z.string().uuid().optional(),
});

const rejectSchema = z.object({
  workspaceId: z.string().uuid(),
  suggestionId: z.string().uuid(),
});

/**
 * POST /api/transactions/[id]/categorize
 * Approve a category for a transaction
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: transactionId } = await params;

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = approveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, categoryId, suggestionId } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'transaction:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify transaction exists and belongs to workspace
    const transaction = await prisma.bankTransaction.findFirst({
      where: { id: transactionId, workspaceId },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Verify category exists and belongs to workspace
    const category = await prisma.category.findFirst({
      where: { id: categoryId, workspaceId },
    });

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Check if categorization already exists
    const existingCategorization = await prisma.transactionCategorization.findFirst({
      where: { transactionId, categoryId },
    });

    let categorization;

    if (existingCategorization) {
      // Update existing categorization to approved
      categorization = await prisma.transactionCategorization.update({
        where: { id: existingCategorization.id },
        data: {
          approved: true,
          approvedAt: new Date(),
          approvedBy: user.id,
        },
      });
    } else {
      // Create new approved categorization
      categorization = await prisma.transactionCategorization.create({
        data: {
          workspaceId,
          transactionId,
          categoryId,
          source: suggestionId ? 'ai' : 'manual',
          approved: true,
          approvedAt: new Date(),
          approvedBy: user.id,
        },
      });
    }

    // If there was an AI suggestion, update its status
    if (suggestionId) {
      await prisma.aiSuggestion.update({
        where: { id: suggestionId },
        data: { status: 'accepted' },
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'transaction.categorize',
        entityType: 'transaction',
        entityId: transactionId,
        newValue: { categoryId, categoryName: category.name, suggestionId },
      },
    });

    // Post to General Ledger (if GL mappings exist)
    // This is async but we don't wait for it to complete
    let glEntryId: string | null = null;
    try {
      const glResult = await postTransactionToGL(transactionId, categoryId, workspaceId, user.id);
      glEntryId = glResult?.journalEntryId ?? null;
    } catch (error) {
      // Log but don't fail - GL posting is optional based on GL mappings
      console.error('Failed to post transaction to GL:', error);
    }

    return NextResponse.json({
      id: categorization.id,
      transactionId,
      categoryId,
      categoryName: category.name,
      approved: true,
      approvedAt: categorization.approvedAt?.toISOString(),
      glEntryId,
    });
  } catch (error) {
    console.error('Failed to categorize transaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/transactions/[id]/categorize
 * Reject a category suggestion for a transaction
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: transactionId } = await params;

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = rejectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, suggestionId } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'transaction:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Update the AI suggestion to rejected
    const suggestion = await prisma.aiSuggestion.findFirst({
      where: { id: suggestionId, workspaceId, targetId: transactionId },
    });

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    await prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status: 'rejected' },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'suggestion.reject',
        entityType: 'suggestion',
        entityId: suggestionId,
        oldValue: { status: suggestion.status },
        newValue: { status: 'rejected' },
      },
    });

    return NextResponse.json({
      id: suggestionId,
      status: 'rejected',
    });
  } catch (error) {
    console.error('Failed to reject suggestion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
