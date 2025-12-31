/**
 * Weekly Digest API
 *
 * GET /api/insights/digest - Generate and return weekly digest for a workspace
 */

import { prisma } from '@moneio/db';
import {
  generateWeeklyDigest,
  detectRecurringPatterns,
  trackSubscriptions,
  type Insight,
  type Subscription,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
});

/**
 * GET /api/insights/digest
 * Generate and return weekly digest for a workspace
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
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Fetch data for the digest - last 2 weeks of transactions
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        postedAt: { gte: twoWeeksAgo },
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

    // Transform transactions to input format
    const txInputs = transactions.map((tx) => ({
      id: tx.id,
      postedAt: tx.postedAt,
      description: tx.description,
      amount: tx.amount.toNumber(),
      currency: tx.currency,
      categorizations: tx.categorizations.map((c) => ({
        category: c.category ? { id: c.category.id, name: c.category.name } : null,
      })),
    }));

    // Get recurring patterns and subscriptions
    const patterns = detectRecurringPatterns(txInputs);
    const subscriptions = trackSubscriptions(patterns);

    // Get recent insights (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const dbInsights = await prisma.insight.findMany({
      where: {
        workspaceId,
        createdAt: { gte: oneWeekAgo },
        dismissedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Convert to domain Insight type
    const insights: Insight[] = dbInsights.map((i) => ({
      id: i.id,
      workspaceId: i.workspaceId,
      type: i.type as Insight['type'],
      severity: i.severity as Insight['severity'],
      title: i.title,
      message: i.message,
      data: (i.data as Record<string, unknown>) || {},
      actionUrl: i.actionUrl || undefined,
      actionLabel: i.actionLabel || undefined,
      createdAt: i.createdAt,
      readAt: i.readAt || undefined,
      dismissedAt: i.dismissedAt || undefined,
      expiresAt: i.expiresAt || undefined,
    }));

    // Calculate previous week data for comparison
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    const prevWeekTxs = transactions.filter(
      (tx) => tx.postedAt >= threeWeeksAgo && tx.postedAt < twoWeeksAgo
    );

    let previousWeekData;
    if (prevWeekTxs.length > 0) {
      let totalIncome = 0;
      let totalExpenses = 0;
      for (const tx of prevWeekTxs) {
        const amount = tx.amount.toNumber();
        if (amount >= 0) {
          totalIncome += amount;
        } else {
          totalExpenses += Math.abs(amount);
        }
      }
      previousWeekData = {
        totalIncome,
        totalExpenses,
        netCashflow: totalIncome - totalExpenses,
      };
    }

    // Generate digest
    const digest = generateWeeklyDigest({
      workspaceId,
      transactions: txInputs,
      subscriptions: subscriptions as Subscription[],
      insights,
      previousWeekData,
    });

    // Format response
    return NextResponse.json({
      digest: {
        period: {
          start: digest.period.start.toISOString(),
          end: digest.period.end.toISOString(),
        },
        summary: {
          totalIncome: digest.summary.totalIncome.toFixed(2),
          totalExpenses: digest.summary.totalExpenses.toFixed(2),
          netCashflow: digest.summary.netCashflow.toFixed(2),
          transactionCount: digest.summary.transactionCount,
          comparedToLastWeek: {
            incomeChange: digest.summary.comparedToLastWeek.incomeChange.toFixed(1),
            expensesChange: digest.summary.comparedToLastWeek.expensesChange.toFixed(1),
            netChange: digest.summary.comparedToLastWeek.netChange.toFixed(1),
          },
        },
        topCategories: digest.topCategories,
        topMerchants: digest.topMerchants,
        highlights: digest.highlights,
        insights: digest.insights.map((i) => ({
          id: i.id,
          type: i.type,
          severity: i.severity,
          title: i.title,
          message: i.message,
          actionUrl: i.actionUrl,
        })),
        actionItems: digest.actionItems,
        subscriptionsSummary: {
          activeCount: digest.subscriptionsSummary.activeCount,
          monthlyTotal: digest.subscriptionsSummary.monthlyTotal.toFixed(2),
          upcomingCharges: digest.subscriptionsSummary.upcomingCharges.map((c) => ({
            name: c.name,
            amount: c.amount.toFixed(2),
            expectedDate: c.expectedDate.toISOString().split('T')[0],
          })),
        },
        forecast: {
          nextWeekProjection: digest.forecast.nextWeekProjection.toFixed(2),
          cashflowStatus: digest.forecast.cashflowStatus,
          projectionBasis: digest.forecast.projectionBasis,
        },
        currency: digest.currency,
        generatedAt: digest.generatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to generate weekly digest:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
