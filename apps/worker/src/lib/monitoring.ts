/**
 * Worker monitoring and alerting
 *
 * Tracks:
 * - Job completion rates
 * - Processing times
 * - Error rates per queue
 * - Queue depths
 * - Dead Letter Queue (DLQ) metrics
 *
 * Alerts can be sent to:
 * - Slack webhook
 * - Sentry
 * - Custom webhook
 */

import type { Worker, Job, Queue } from 'bullmq';

import { logger } from './logger';

// ============================================================
// Metrics Types
// ============================================================

interface QueueMetrics {
  completed: number;
  failed: number;
  totalDuration: number;
  lastError?: string;
  lastErrorAt?: Date;
  consecutiveFailures: number;
}

interface WorkerMetrics {
  startedAt: Date;
  queues: Map<string, QueueMetrics>;
}

// ============================================================
// Metrics Storage
// ============================================================

const metrics: WorkerMetrics = {
  startedAt: new Date(),
  queues: new Map(),
};

function getQueueMetrics(queueName: string): QueueMetrics {
  if (!metrics.queues.has(queueName)) {
    metrics.queues.set(queueName, {
      completed: 0,
      failed: 0,
      totalDuration: 0,
      consecutiveFailures: 0,
    });
  }
  return metrics.queues.get(queueName)!;
}

// ============================================================
// Alert Configuration
// ============================================================

interface AlertConfig {
  slackWebhookUrl?: string;
  sentryDsn?: string;
  alertWebhookUrl?: string;
  consecutiveFailureThreshold: number;
  errorRateThreshold: number; // percentage
}

const alertConfig: AlertConfig = {
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  sentryDsn: process.env.SENTRY_DSN,
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
  consecutiveFailureThreshold: parseInt(process.env.ALERT_CONSECUTIVE_FAILURES || '5'),
  errorRateThreshold: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD || '20'),
};

// ============================================================
// Alert Functions
// ============================================================

async function sendSlackAlert(message: string, severity: 'warning' | 'error'): Promise<void> {
  if (!alertConfig.slackWebhookUrl) return;

  try {
    const color = severity === 'error' ? '#dc2626' : '#f59e0b';
    await fetch(alertConfig.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [
          {
            color,
            title: `Moneio Worker Alert: ${severity.toUpperCase()}`,
            text: message,
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send Slack alert');
  }
}

async function sendAlert(
  message: string,
  severity: 'warning' | 'error',
  context?: Record<string, unknown>
): Promise<void> {
  const logLevel = severity === 'warning' ? 'warn' : 'error';
  logger[logLevel]({ alert: true, severity, ...context }, message);

  await sendSlackAlert(message, severity);

  // Send to custom webhook if configured
  if (alertConfig.alertWebhookUrl) {
    try {
      await fetch(alertConfig.alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'moneio-worker',
          severity,
          message,
          context,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send webhook alert');
    }
  }
}

// ============================================================
// Event Handlers
// ============================================================

export function trackJobCompleted(queueName: string, job: Job, duration: number): void {
  const queueMetrics = getQueueMetrics(queueName);
  queueMetrics.completed++;
  queueMetrics.totalDuration += duration;
  queueMetrics.consecutiveFailures = 0; // Reset on success

  logger.info(
    {
      queue: queueName,
      jobId: job.id,
      duration,
      attemptsMade: job.attemptsMade,
    },
    'Job completed'
  );
}

export function trackJobFailed(queueName: string, job: Job | undefined, error: Error): void {
  const queueMetrics = getQueueMetrics(queueName);
  queueMetrics.failed++;
  queueMetrics.lastError = error.message;
  queueMetrics.lastErrorAt = new Date();
  queueMetrics.consecutiveFailures++;

  logger.error(
    {
      queue: queueName,
      jobId: job?.id,
      error: error.message,
      attemptsMade: job?.attemptsMade,
      consecutiveFailures: queueMetrics.consecutiveFailures,
    },
    'Job failed'
  );

  // Check if we should alert
  if (queueMetrics.consecutiveFailures >= alertConfig.consecutiveFailureThreshold) {
    sendAlert(
      `Queue "${queueName}" has ${queueMetrics.consecutiveFailures} consecutive failures. Last error: ${error.message}`,
      'error',
      { queue: queueName, jobId: job?.id }
    );
  }

  // Check error rate
  const total = queueMetrics.completed + queueMetrics.failed;
  if (total >= 10) {
    const errorRate = (queueMetrics.failed / total) * 100;
    if (errorRate >= alertConfig.errorRateThreshold) {
      sendAlert(
        `Queue "${queueName}" has high error rate: ${errorRate.toFixed(1)}% (${queueMetrics.failed}/${total})`,
        'warning',
        { queue: queueName, errorRate }
      );
    }
  }
}

// ============================================================
// Attach Monitoring to Workers
// ============================================================

export function attachMonitoring(worker: Worker): void {
  const queueName = worker.name;

  worker.on('completed', (job) => {
    const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    trackJobCompleted(queueName, job, duration);
  });

  worker.on('failed', (job, error) => {
    trackJobFailed(queueName, job, error);
  });

  worker.on('error', (error) => {
    logger.error({ queue: queueName, error: error.message }, 'Worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ queue: queueName, jobId }, 'Job stalled');
    sendAlert(`Job ${jobId} stalled in queue "${queueName}"`, 'warning', {
      queue: queueName,
      jobId,
    });
  });
}

// ============================================================
// Metrics Endpoint Data
// ============================================================

export function getMetrics(): {
  uptime: number;
  queues: Record<
    string,
    {
      completed: number;
      failed: number;
      avgDuration: number;
      errorRate: number;
      consecutiveFailures: number;
    }
  >;
} {
  const uptime = Date.now() - metrics.startedAt.getTime();
  const queues: Record<string, unknown> = {};

  for (const [name, qm] of metrics.queues) {
    const total = qm.completed + qm.failed;
    queues[name] = {
      completed: qm.completed,
      failed: qm.failed,
      avgDuration: qm.completed > 0 ? Math.round(qm.totalDuration / qm.completed) : 0,
      errorRate: total > 0 ? parseFloat(((qm.failed / total) * 100).toFixed(2)) : 0,
      consecutiveFailures: qm.consecutiveFailures,
    };
  }

  return { uptime, queues: queues as ReturnType<typeof getMetrics>['queues'] };
}

// ============================================================
// Health Check
// ============================================================

export function isHealthy(): { healthy: boolean; reason?: string } {
  for (const [name, qm] of metrics.queues) {
    if (qm.consecutiveFailures >= alertConfig.consecutiveFailureThreshold) {
      return {
        healthy: false,
        reason: `Queue "${name}" has ${qm.consecutiveFailures} consecutive failures`,
      };
    }
  }
  return { healthy: true };
}

// ============================================================
// Dead Letter Queue (DLQ) Monitoring
// ============================================================

interface DlqMetrics {
  depth: number;
  lastCheckedAt: Date;
  oldestJobAge?: number; // in hours
  alertSent: boolean;
}

const dlqMetrics: DlqMetrics = {
  depth: 0,
  lastCheckedAt: new Date(),
  alertSent: false,
};

const DLQ_DEPTH_THRESHOLD = parseInt(process.env.DLQ_DEPTH_THRESHOLD || '10');
const DLQ_AGE_THRESHOLD_HOURS = parseInt(process.env.DLQ_AGE_THRESHOLD_HOURS || '24');

/**
 * Check DLQ depth and age, send alerts if thresholds exceeded
 */
export async function checkDlqHealth(dlqQueue: Queue): Promise<DlqMetrics> {
  try {
    const waiting = await dlqQueue.getWaitingCount();
    const delayed = await dlqQueue.getDelayedCount();
    dlqMetrics.depth = waiting + delayed;
    dlqMetrics.lastCheckedAt = new Date();

    // Get oldest job to calculate age
    const waitingJobs = await dlqQueue.getJobs(['waiting'], 0, 1);
    if (waitingJobs.length > 0 && waitingJobs[0].timestamp) {
      const ageMs = Date.now() - waitingJobs[0].timestamp;
      dlqMetrics.oldestJobAge = Math.round(ageMs / (1000 * 60 * 60)); // hours
    }

    // Alert if depth exceeds threshold
    if (dlqMetrics.depth >= DLQ_DEPTH_THRESHOLD && !dlqMetrics.alertSent) {
      await sendAlert(
        `Dead Letter Queue has ${dlqMetrics.depth} failed jobs waiting for review`,
        'warning',
        {
          dlqDepth: dlqMetrics.depth,
          oldestJobAgeHours: dlqMetrics.oldestJobAge,
        }
      );
      dlqMetrics.alertSent = true;
    }

    // Alert if oldest job is too old
    if (dlqMetrics.oldestJobAge && dlqMetrics.oldestJobAge >= DLQ_AGE_THRESHOLD_HOURS) {
      await sendAlert(
        `Dead Letter Queue has jobs older than ${DLQ_AGE_THRESHOLD_HOURS} hours (oldest: ${dlqMetrics.oldestJobAge}h)`,
        'warning',
        {
          dlqDepth: dlqMetrics.depth,
          oldestJobAgeHours: dlqMetrics.oldestJobAge,
        }
      );
    }

    // Reset alert flag if depth drops below threshold
    if (dlqMetrics.depth < DLQ_DEPTH_THRESHOLD) {
      dlqMetrics.alertSent = false;
    }

    return dlqMetrics;
  } catch (error) {
    logger.error({ error }, 'Failed to check DLQ health');
    return dlqMetrics;
  }
}

/**
 * Get current DLQ metrics
 */
export function getDlqMetrics(): DlqMetrics {
  return { ...dlqMetrics };
}

/**
 * Track when a job is moved to DLQ
 */
export function trackDlqJob(originalQueue: string, jobId: string, error: string): void {
  dlqMetrics.depth++;
  logger.warn(
    {
      originalQueue,
      jobId,
      error,
      dlqDepth: dlqMetrics.depth,
    },
    'Job moved to DLQ'
  );
}
