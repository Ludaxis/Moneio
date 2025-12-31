/**
 * Subscriptions API
 *
 * GET /api/insights/subscriptions - Get tracked subscriptions from recurring patterns
 */

import { prisma } from '@moneio/db';
import {
  detectRecurringPatterns,
  trackSubscriptions,
  getSubscriptionSummary,
  type SubscriptionTrackerOptions,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  lookbackMonths: z.coerce.number().int().min(1).max(24).optional(),
  activeOnly: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  flaggedOnly: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

/**
 * GET /api/insights/subscriptions
 * Get tracked subscriptions for a workspace
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
      minConfidence: searchParams.get('minConfidence') || undefined,
      lookbackMonths: searchParams.get('lookbackMonths') || undefined,
      activeOnly: searchParams.get('activeOnly') || undefined,
      flaggedOnly: searchParams.get('flaggedOnly') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, minConfidence, lookbackMonths, activeOnly, flaggedOnly } = parsed.data;

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

    // Detect recurring patterns first
    const patterns = detectRecurringPatterns(inputTransactions, {
      minOccurrences: 2,
      minConfidence: 0.4,
      lookbackMonths: lookback,
    });

    // Convert to subscriptions with tracking options
    const options: SubscriptionTrackerOptions = {
      minConfidence: minConfidence || 0.6,
    };

    let subscriptions = trackSubscriptions(patterns, options);

    // Apply filters
    if (activeOnly) {
      subscriptions = subscriptions.filter((s) => s.status === 'active');
    }
    if (flaggedOnly) {
      subscriptions = subscriptions.filter((s) => s.flags.length > 0);
    }

    // Get summary
    const summary = getSubscriptionSummary(subscriptions);

    // Format response
    const formatted = subscriptions.map((s) => ({
      id: s.id,
      merchantName: s.merchantName,
      normalizedName: s.normalizedName,
      amount: s.amount.toFixed(2),
      currency: s.currency,
      frequency: s.frequency,
      monthlyEquivalent: s.monthlyEquivalent.toFixed(2),
      category: s.category || null,
      categoryId: s.categoryId || null,
      firstSeen: s.firstSeen.toISOString().split('T')[0],
      lastCharge: s.lastCharge.toISOString().split('T')[0],
      chargeCount: s.chargeCount,
      status: s.status,
      confidence: s.confidence,
      flags: s.flags.map((f) => ({
        type: f.type,
        severity: f.severity,
        message: f.message,
        potentialSavings: f.potentialSavings ? f.potentialSavings.toFixed(2) : null,
        suggestion: f.suggestion || null,
      })),
      transactionIds: s.transactionIds,
    }));

    return NextResponse.json({
      subscriptions: formatted,
      summary: {
        totalMonthly: summary.totalMonthly.toFixed(2),
        totalAnnual: summary.totalAnnual.toFixed(2),
        subscriptionCount: summary.subscriptionCount,
        activeCount: summary.activeCount,
        flaggedCount: summary.flaggedCount,
        potentialSavings: summary.potentialSavings.toFixed(2),
        currency: summary.currency,
        byCategory: summary.byCategory.map((c) => ({
          category: c.category,
          monthly: c.monthly.toFixed(2),
          count: c.count,
        })),
        byFrequency: Object.entries(summary.byFrequency).map(([freq, data]) => ({
          frequency: freq,
          count: data.count,
          monthly: data.monthly.toFixed(2),
        })),
      },
      analyzed: {
        transactionCount: transactions.length,
        lookbackMonths: lookback,
        cutoffDate: cutoffDate.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Failed to get subscriptions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
