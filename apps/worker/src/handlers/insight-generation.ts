/**
 * INSIGHT_GENERATION handler
 *
 * Runs anomaly detection and generates insights for a workspace.
 * - Fetches recent transactions
 * - Runs anomaly detection algorithms
 * - Checks for subscription changes
 * - Generates and stores insights in the database
 */

import { prisma, Prisma } from '@moneio/db';
import {
  detectAnomalies,
  convertAnomalyToInsightData,
  trackSubscriptions,
  detectRecurringPatterns,
  type TransactionInput,
  type InsightType,
  type InsightSeverity,
} from '@moneio/domain';
import { Job } from 'bullmq';

import type { InsightGenerationJobData, InsightGenerationResult } from '../lib/queues';

/**
 * Handle insight generation for a workspace
 */
export async function handleInsightGeneration(
  job: Job<InsightGenerationJobData>
): Promise<InsightGenerationResult> {
  const { workspaceId, triggeredBy } = job.data;

  console.log(
    `[INSIGHT_GENERATION] Processing workspace ${workspaceId} (triggered by: ${triggeredBy})`
  );

  try {
    await job.updateProgress(10);

    // Fetch transactions from the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        postedAt: { gte: sixMonthsAgo },
      },
      orderBy: { postedAt: 'desc' },
    });

    if (transactions.length === 0) {
      console.log(`[INSIGHT_GENERATION] No transactions found for workspace ${workspaceId}`);
      return { success: true, insightsGenerated: 0 };
    }

    await job.updateProgress(30);

    // Convert to domain TransactionInput format
    const txInputs: TransactionInput[] = transactions.map((tx) => ({
      id: tx.id,
      amount: Number(tx.amount),
      currency: tx.currency,
      description: tx.description,
      postedAt: tx.postedAt,
    }));

    // Run anomaly detection
    const anomalyResult = detectAnomalies({ transactions: txInputs });
    await job.updateProgress(50);

    // Detect recurring patterns and track subscriptions
    const patterns = detectRecurringPatterns(txInputs);
    const subscriptions = trackSubscriptions(patterns);
    await job.updateProgress(70);

    // Generate insights from anomalies
    const insightsToCreate: Prisma.InsightCreateManyInput[] = [];

    // Add anomaly insights
    for (const anomaly of anomalyResult.anomalies) {
      const insightData = convertAnomalyToInsightData(anomaly);

      // Check if similar insight already exists (avoid duplicates)
      const existingInsight = await prisma.insight.findFirst({
        where: {
          workspaceId,
          type: insightData.type,
          dismissedAt: null,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
        },
      });

      if (!existingInsight) {
        const severity = mapAnomalySeverity(anomaly.severity);
        insightsToCreate.push({
          workspaceId,
          type: insightData.type,
          severity,
          title: insightData.title,
          message: insightData.message,
          data: insightData.data as Prisma.InputJsonValue,
          actionUrl: '/transactions',
          actionLabel: 'View Transactions',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Expires in 30 days
        });
      }
    }

    // Add subscription-related insights
    for (const sub of subscriptions) {
      for (const flag of sub.flags) {
        // Map flag type to insight type
        const insightType = mapFlagToInsightType(flag.type);
        if (!insightType) continue;

        // Check for existing similar insight
        const existingInsight = await prisma.insight.findFirst({
          where: {
            workspaceId,
            type: insightType,
            dismissedAt: null,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            data: {
              path: ['subscriptionId'],
              equals: sub.id,
            },
          },
        });

        if (!existingInsight) {
          insightsToCreate.push({
            workspaceId,
            type: insightType,
            severity: mapFlagSeverity(flag.severity),
            title: `${sub.merchantName}: ${formatFlagType(flag.type)}`,
            message: flag.message,
            data: {
              subscriptionId: sub.id,
              merchantName: sub.merchantName,
              amount: sub.amount,
              currency: sub.currency,
              potentialSavings: flag.potentialSavings,
              flagType: flag.type,
            } as Prisma.InputJsonValue,
            actionUrl: '/subscriptions',
            actionLabel: 'View Subscriptions',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }
      }
    }

    await job.updateProgress(90);

    // Batch insert insights
    if (insightsToCreate.length > 0) {
      await prisma.insight.createMany({
        data: insightsToCreate,
      });
    }

    await job.updateProgress(100);

    console.log(
      `[INSIGHT_GENERATION] Generated ${insightsToCreate.length} insights for workspace ${workspaceId}`
    );

    return {
      success: true,
      insightsGenerated: insightsToCreate.length,
      anomaliesDetected: anomalyResult.anomalies.length,
      subscriptionsAnalyzed: subscriptions.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[INSIGHT_GENERATION] Failed:`, errorMessage);

    return {
      success: false,
      insightsGenerated: 0,
      error: errorMessage,
    };
  }
}

/**
 * Map anomaly severity to insight severity
 */
function mapAnomalySeverity(severity: 'minor' | 'significant' | 'major'): InsightSeverity {
  switch (severity) {
    case 'major':
      return 'alert';
    case 'significant':
      return 'warning';
    case 'minor':
    default:
      return 'info';
  }
}

/**
 * Map flag severity to insight severity
 */
function mapFlagSeverity(severity: 'info' | 'warning' | 'alert'): InsightSeverity {
  return severity as InsightSeverity;
}

/**
 * Map subscription flag type to insight type
 */
function mapFlagToInsightType(flagType: string): InsightType | null {
  switch (flagType) {
    case 'price_increase':
      return 'subscription_change';
    case 'duplicate':
      return 'savings_opportunity';
    case 'unused':
      return 'savings_opportunity';
    case 'expensive':
      return 'savings_opportunity';
    default:
      return null;
  }
}

/**
 * Format flag type for display
 */
function formatFlagType(flagType: string): string {
  return flagType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
