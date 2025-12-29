/**
 * Recurring Transactions API
 *
 * GET /api/transactions/recurring - Detect and list recurring transaction patterns
 */

import { prisma } from '@moneio/db';
import {
  detectRecurringPatterns,
  getRecurringSummary,
  type RecurringDetectorOptions,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  minOccurrences: z.coerce.number().int().min(2).max(10).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  lookbackMonths: z.coerce.number().int().min(1).max(24).optional(),
  activeOnly: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

/**
 * GET /api/transactions/recurring
 * Detect recurring transaction patterns for a workspace
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
      minOccurrences: searchParams.get('minOccurrences'),
      minConfidence: searchParams.get('minConfidence'),
      lookbackMonths: searchParams.get('lookbackMonths'),
      activeOnly: searchParams.get('activeOnly'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, minOccurrences, minConfidence, lookbackMonths, activeOnly } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Calculate date cutoff based on lookback months
    const lookback = lookbackMonths || 12;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - lookback);

    // Get transactions for analysis
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        postedAt: { gte: cutoffDate },
      },
      select: {
        id: true,
        postedAt: true,
        description: true,
        amount: true,
        currency: true,
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
      orderBy: { postedAt: 'desc' },
    });

    // Transform to input format and detect patterns
    const inputTransactions = transactions.map((tx) => ({
      id: tx.id,
      postedAt: tx.postedAt,
      description: tx.description,
      amount: tx.amount.toNumber(),
      currency: tx.currency,
      categorizations: tx.categorizations.map((c) => ({
        category: c.category ? { id: c.category.id, name: c.category.name } : null,
      })),
    }));

    const options: RecurringDetectorOptions = {
      minOccurrences: minOccurrences || 3,
      minConfidence: minConfidence || 0.5,
      lookbackMonths: lookback,
    };

    let patterns = detectRecurringPatterns(inputTransactions, options);

    // Filter to active only if requested
    if (activeOnly) {
      patterns = patterns.filter((p) => p.isActive);
    }

    // Get summary
    const summary = getRecurringSummary(patterns);

    // Format response
    const formatted = patterns.map((p) => ({
      id: p.id,
      merchantName: p.merchantName,
      normalizedMerchant: p.normalizedMerchant,
      frequency: p.frequency,
      avgAmount: p.avgAmount.toFixed(2),
      amountVariance: p.amountVariance.toFixed(2),
      currency: p.currency,
      confidence: p.confidence,
      lastOccurrence: p.lastOccurrence.toISOString().split('T')[0],
      nextExpected: p.nextExpected.toISOString().split('T')[0],
      transactionCount: p.transactionCount,
      isActive: p.isActive,
      category: p.categoryId ? { id: p.categoryId, name: p.categoryName } : null,
    }));

    return NextResponse.json({
      patterns: formatted,
      summary: {
        totalPatterns: summary.totalPatterns,
        activePatterns: summary.activePatterns,
        monthlyTotal: summary.monthlyTotal.toFixed(2),
        currency: summary.currency,
      },
      analyzed: {
        transactionCount: transactions.length,
        lookbackMonths: lookback,
        cutoffDate: cutoffDate.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Failed to detect recurring transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
