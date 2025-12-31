/**
 * NOTIFICATION handlers
 *
 * Handles sending notifications to users:
 * - Weekly digest emails
 * - High-severity insight alerts
 * - Invoice reminders
 */

import { prisma } from '@moneio/db';
import {
  generateWeeklyDigest,
  type TransactionInput,
  type Insight,
  type Subscription,
  trackSubscriptions,
  detectRecurringPatterns,
} from '@moneio/domain';
import { Job } from 'bullmq';

import type {
  SendNotificationJobData,
  SendWeeklyDigestJobData,
  NotificationResult,
} from '../lib/queues';

/**
 * Handle sending a notification
 */
export async function handleSendNotification(
  job: Job<SendNotificationJobData>
): Promise<NotificationResult> {
  const { userId, type, payload } = job.data;

  console.log(`[NOTIFICATION] Sending ${type} notification to user ${userId}`);

  try {
    await job.updateProgress(10);

    // Get user and preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPreferences: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const prefs = user.notificationPreferences;

    // Check if notification type is enabled
    if (prefs) {
      if (type === 'insight_alert' && !prefs.anomalyAlerts) {
        console.log(`[NOTIFICATION] User ${userId} has anomaly alerts disabled`);
        return { success: true, sent: false, reason: 'disabled_by_user' };
      }
      if (type === 'weekly_digest' && !prefs.weeklyDigest) {
        console.log(`[NOTIFICATION] User ${userId} has weekly digest disabled`);
        return { success: true, sent: false, reason: 'disabled_by_user' };
      }
      if (type === 'invoice_reminder' && !prefs.invoiceReminders) {
        console.log(`[NOTIFICATION] User ${userId} has invoice reminders disabled`);
        return { success: true, sent: false, reason: 'disabled_by_user' };
      }
    }

    await job.updateProgress(50);

    // TODO: Implement actual email/push sending
    // For now, just log the notification
    console.log(`[NOTIFICATION] Would send ${type} to ${user.email}:`, payload);

    // In a real implementation, this would:
    // 1. Format the email content based on type
    // 2. Send via email provider (Resend, SendGrid, etc.)
    // 3. Track delivery status

    await job.updateProgress(100);

    return {
      success: true,
      sent: true,
      channel: prefs?.emailEnabled ? 'email' : 'in_app',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NOTIFICATION] Failed:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Handle generating and sending weekly digest
 */
export async function handleSendWeeklyDigest(
  job: Job<SendWeeklyDigestJobData>
): Promise<NotificationResult> {
  const { workspaceId, userId } = job.data;

  console.log(`[WEEKLY_DIGEST] Generating digest for workspace ${workspaceId}`);

  try {
    await job.updateProgress(10);

    // Get user and check preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPreferences: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.notificationPreferences && !user.notificationPreferences.weeklyDigest) {
      console.log(`[WEEKLY_DIGEST] User ${userId} has weekly digest disabled`);
      return { success: true, sent: false, reason: 'disabled_by_user' };
    }

    await job.updateProgress(20);

    // Fetch data for the digest
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        postedAt: { gte: twoWeeksAgo },
      },
      orderBy: { postedAt: 'desc' },
    });

    await job.updateProgress(40);

    // Convert to domain format
    const txInputs: TransactionInput[] = transactions.map((tx) => ({
      id: tx.id,
      amount: Number(tx.amount),
      currency: tx.currency,
      description: tx.description,
      postedAt: tx.postedAt,
    }));

    // Get recurring patterns and subscriptions
    const patterns = detectRecurringPatterns(txInputs);
    const subscriptions = trackSubscriptions(patterns);

    await job.updateProgress(60);

    // Get recent insights
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const dbInsights = await prisma.insight.findMany({
      where: {
        workspaceId,
        createdAt: { gte: oneWeekAgo },
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

    await job.updateProgress(80);

    // Calculate previous week data for comparison
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    const prevWeekTxs = transactions.filter(
      (tx) => tx.postedAt >= threeWeeksAgo && tx.postedAt < twoWeeksAgo
    );

    let prevWeekData;
    if (prevWeekTxs.length > 0) {
      let totalIncome = 0;
      let totalExpenses = 0;
      for (const tx of prevWeekTxs) {
        const amount = Number(tx.amount);
        if (amount >= 0) {
          totalIncome += amount;
        } else {
          totalExpenses += Math.abs(amount);
        }
      }
      prevWeekData = {
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
      previousWeekData: prevWeekData,
    });

    await job.updateProgress(90);

    // TODO: Send digest email
    console.log(`[WEEKLY_DIGEST] Generated digest for ${user.email}:`, {
      period: digest.period,
      summary: digest.summary,
      highlightsCount: digest.highlights.length,
      actionItemsCount: digest.actionItems.length,
    });

    // In a real implementation, this would format and send the digest email

    await job.updateProgress(100);

    return {
      success: true,
      sent: true,
      channel: 'email',
      digestPeriod: digest.period,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[WEEKLY_DIGEST] Failed:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}
