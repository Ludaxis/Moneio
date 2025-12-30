/**
 * Money Leaks API
 *
 * GET /api/insights/money-leaks - Detect money leaks from transactions and subscriptions
 */

import { prisma } from '@moneio/db';
import {
  detectRecurringPatterns,
  trackSubscriptions,
  detectMoneyLeaks,
  getMoneyLeaksSummary,
  type MoneyLeakDetectorOptions,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  lookbackMonths: z.coerce.number().int().min(1).max(24).optional(),
  minSeverity: z.enum(['low', 'medium', 'high']).optional(),
  type: z
    .enum(['subscription', 'fee', 'duplicate_charge', 'price_creep', 'unused_service', 'forgotten_subscription'])
    .optional(),
});

/**
 * GET /api/insights/money-leaks
 * Detect money leaks for a workspace
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
      lookbackMonths: searchParams.get('lookbackMonths'),
      minSeverity: searchParams.get('minSeverity'),
      type: searchParams.get('type'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, lookbackMonths, minSeverity, type } = parsed.data;

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

    // Transform to input format
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

    // Detect recurring patterns and subscriptions
    const patterns = detectRecurringPatterns(inputTransactions, {
      minOccurrences: 2,
      minConfidence: 0.4,
      lookbackMonths: lookback,
    });

    const subscriptions = trackSubscriptions(patterns, {
      minConfidence: 0.5,
    });

    // Detect money leaks
    const options: MoneyLeakDetectorOptions = {};
    let leaks = detectMoneyLeaks(inputTransactions, subscriptions, options);

    // Apply filters
    if (minSeverity) {
      const severityOrder = { low: 1, medium: 2, high: 3 };
      const minOrder = severityOrder[minSeverity];
      leaks = leaks.filter((l) => severityOrder[l.severity] >= minOrder);
    }

    if (type) {
      leaks = leaks.filter((l) => l.type === type);
    }

    // Get summary
    const summary = getMoneyLeaksSummary(leaks);

    // Format response
    const formatted = leaks.map((l) => ({
      id: l.id,
      type: l.type,
      severity: l.severity,
      title: l.title,
      description: l.description,
      affectedTransactions: l.affectedTransactions,
      monthlyImpact: l.monthlyImpact.toFixed(2),
      annualImpact: l.annualImpact.toFixed(2),
      currency: l.currency,
      recommendation: l.recommendation,
      actionable: l.actionable,
      detectedAt: l.detectedAt.toISOString(),
      status: l.status,
      metadata: l.metadata || null,
    }));

    return NextResponse.json({
      leaks: formatted,
      summary: {
        totalLeaks: summary.totalLeaks,
        newLeaks: summary.newLeaks,
        totalPotentialSavings: summary.totalPotentialSavings.toFixed(2),
        currency: summary.currency,
        byType: Object.entries(summary.byType).map(([t, data]) => ({
          type: t,
          count: data.count,
          savings: data.savings.toFixed(2),
        })),
        bySeverity: summary.bySeverity,
        topLeaks: summary.topLeaks.map((l) => ({
          id: l.id,
          type: l.type,
          severity: l.severity,
          title: l.title,
          annualImpact: l.annualImpact.toFixed(2),
          currency: l.currency,
        })),
      },
      analyzed: {
        transactionCount: transactions.length,
        subscriptionCount: subscriptions.length,
        lookbackMonths: lookback,
        cutoffDate: cutoffDate.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Failed to detect money leaks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
