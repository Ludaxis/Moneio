import { extractTraceContext, type TraceContext } from '@moneio/observability';
import { Queue, QueueEvents } from 'bullmq';
import type { QueueOptions, Job } from 'bullmq';

import { logger } from './logger';
import { trackDlqJob } from './monitoring';
import { getRedisConnection } from './redis';

// ============================================================
// Trace Context in Job Data
// ============================================================

/**
 * Base interface for job data with optional trace context
 * All job data types should extend this to support distributed tracing
 */
export interface TracedJobData {
  /** Trace context for distributed tracing (auto-populated by enqueue functions) */
  _traceContext?: TraceContext | null;
}

// ============================================================
// Queue Names
// ============================================================

export const QUEUE_NAMES = {
  DOC_NORMALIZE: 'doc-normalize',
  DOC_OCR: 'doc-ocr',
  DOC_EXTRACT: 'doc-extract',
  DOC_POSTPROCESS: 'doc-postprocess',
  CATEGORIZATION: 'categorization',
  GL_POST: 'gl-post',
  FX_FETCH: 'fx-fetch',
  INSIGHT_GENERATION: 'insight-generation',
  SEND_NOTIFICATION: 'send-notification',
  SEND_WEEKLY_DIGEST: 'send-weekly-digest',
  DEAD_LETTER: 'dead-letter-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================================
// Job Data Types (all extend TracedJobData for distributed tracing)
// ============================================================

export interface DocNormalizeJobData extends TracedJobData {
  documentId: string;
  workspaceId: string;
}

export interface DocOcrJobData extends TracedJobData {
  documentId: string;
  workspaceId: string;
  pageNumber: number;
  storagePath: string;
  mimeType: string;
}

export interface DocExtractJobData extends TracedJobData {
  documentId: string;
  workspaceId: string;
}

export interface DocPostprocessJobData extends TracedJobData {
  documentId: string;
  workspaceId: string;
  extractionId: string;
}

export interface CategorizationJobData extends TracedJobData {
  workspaceId: string;
  transactionIds: string[];
}

export interface GlPostJobData extends TracedJobData {
  workspaceId: string;
  transactionIds: string[];
  userId: string;
}

export interface FxFetchJobData extends TracedJobData {
  baseCurrency: string;
  workspaceId?: string;
}

export interface InsightGenerationJobData extends TracedJobData {
  workspaceId: string;
  triggeredBy: 'scheduled' | 'manual' | 'transaction_import';
}

export interface SendNotificationJobData extends TracedJobData {
  userId: string;
  type: 'insight_alert' | 'weekly_digest' | 'invoice_reminder';
  payload: Record<string, unknown>;
}

export interface SendWeeklyDigestJobData extends TracedJobData {
  workspaceId: string;
  userId: string;
}

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  originalJobName: string;
  data: unknown;
  error: string;
  failedAt: string;
  attempts: number;
}

// ============================================================
// Job Result Types
// ============================================================

export interface JobResult {
  success: boolean;
  error?: string;
}

export interface DocNormalizeResult extends JobResult {
  documentId: string;
  normalizedPath?: string;
  pageCount?: number;
}

export interface DocOcrResult extends JobResult {
  documentId: string;
  pageNumber: number;
  ocrArtifactId?: string;
}

export interface DocExtractResult extends JobResult {
  documentId: string;
  extractionId?: string;
}

export interface DocPostprocessResult extends JobResult {
  documentId: string;
  invoiceId?: string;
}

export interface CategorizationResult extends JobResult {
  categorized: number;
  suggestions: Array<{
    transactionId: string;
    categoryId: string;
    confidence: number;
  }>;
}

export interface GlPostResult extends JobResult {
  posted: number;
  skipped: number;
  failed: number;
  errors: Array<{ transactionId: string; error: string }>;
}

export interface FxFetchResult extends JobResult {
  baseCurrency: string;
  ratesCount: number;
}

export interface InsightGenerationResult extends JobResult {
  insightsGenerated: number;
  anomaliesDetected?: number;
  subscriptionsAnalyzed?: number;
}

export interface NotificationResult extends JobResult {
  sent?: boolean;
  channel?: 'email' | 'push' | 'in_app';
  reason?: string;
  digestPeriod?: { start: Date; end: Date };
}

// ============================================================
// Queue Configuration
// ============================================================

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 1000,
};

function createQueue<T>(name: string, options?: Partial<QueueOptions>) {
  return new Queue<T>(name, {
    connection: getRedisConnection(),
    defaultJobOptions,
    ...options,
  });
}

// ============================================================
// Queue Instances
// ============================================================

let queues: {
  docNormalize?: Queue<DocNormalizeJobData>;
  docOcr?: Queue<DocOcrJobData>;
  docExtract?: Queue<DocExtractJobData>;
  docPostprocess?: Queue<DocPostprocessJobData>;
  categorization?: Queue<CategorizationJobData>;
  glPost?: Queue<GlPostJobData>;
  fxFetch?: Queue<FxFetchJobData>;
  insightGeneration?: Queue<InsightGenerationJobData>;
  sendNotification?: Queue<SendNotificationJobData>;
  sendWeeklyDigest?: Queue<SendWeeklyDigestJobData>;
  deadLetter?: Queue<DeadLetterJobData>;
} = {};

let queueEvents: Record<string, QueueEvents> = {};

export function getQueues() {
  if (!queues.docNormalize) {
    queues.docNormalize = createQueue<DocNormalizeJobData>(QUEUE_NAMES.DOC_NORMALIZE);
    setupDlqHandler(QUEUE_NAMES.DOC_NORMALIZE, queues.docNormalize);
  }
  if (!queues.docOcr) {
    queues.docOcr = createQueue<DocOcrJobData>(QUEUE_NAMES.DOC_OCR);
    setupDlqHandler(QUEUE_NAMES.DOC_OCR, queues.docOcr);
  }
  if (!queues.docExtract) {
    queues.docExtract = createQueue<DocExtractJobData>(QUEUE_NAMES.DOC_EXTRACT);
    setupDlqHandler(QUEUE_NAMES.DOC_EXTRACT, queues.docExtract);
  }
  if (!queues.docPostprocess) {
    queues.docPostprocess = createQueue<DocPostprocessJobData>(QUEUE_NAMES.DOC_POSTPROCESS);
    setupDlqHandler(QUEUE_NAMES.DOC_POSTPROCESS, queues.docPostprocess);
  }
  if (!queues.categorization) {
    queues.categorization = createQueue<CategorizationJobData>(QUEUE_NAMES.CATEGORIZATION);
    setupDlqHandler(QUEUE_NAMES.CATEGORIZATION, queues.categorization);
  }
  if (!queues.glPost) {
    queues.glPost = createQueue<GlPostJobData>(QUEUE_NAMES.GL_POST);
    setupDlqHandler(QUEUE_NAMES.GL_POST, queues.glPost);
  }
  if (!queues.fxFetch) {
    queues.fxFetch = createQueue<FxFetchJobData>(QUEUE_NAMES.FX_FETCH);
    setupDlqHandler(QUEUE_NAMES.FX_FETCH, queues.fxFetch);
  }
  if (!queues.insightGeneration) {
    queues.insightGeneration = createQueue<InsightGenerationJobData>(
      QUEUE_NAMES.INSIGHT_GENERATION
    );
    setupDlqHandler(QUEUE_NAMES.INSIGHT_GENERATION, queues.insightGeneration);
  }
  if (!queues.sendNotification) {
    queues.sendNotification = createQueue<SendNotificationJobData>(QUEUE_NAMES.SEND_NOTIFICATION);
    setupDlqHandler(QUEUE_NAMES.SEND_NOTIFICATION, queues.sendNotification);
  }
  if (!queues.sendWeeklyDigest) {
    queues.sendWeeklyDigest = createQueue<SendWeeklyDigestJobData>(QUEUE_NAMES.SEND_WEEKLY_DIGEST);
    setupDlqHandler(QUEUE_NAMES.SEND_WEEKLY_DIGEST, queues.sendWeeklyDigest);
  }
  if (!queues.deadLetter) {
    queues.deadLetter = createQueue<DeadLetterJobData>(QUEUE_NAMES.DEAD_LETTER, {
      defaultJobOptions: {
        attempts: 1, // DLQ jobs don't retry
        removeOnComplete: false, // Keep for inspection
        removeOnFail: false,
      },
    });
  }

  return queues as Required<typeof queues>;
}

// ============================================================
// Idempotent Enqueue Helpers
// ============================================================

/**
 * Check if a job already exists or has been completed recently
 * Returns the existing job if found, null otherwise
 */
async function getExistingJob<T>(queue: Queue<T>, jobId: string): Promise<Job<T> | null> {
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      // Return job if it's not failed (still relevant)
      if (state !== 'failed') {
        return job;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Idempotent enqueue - checks if job exists before adding
 * Returns existing job if found, otherwise creates new one
 * Automatically captures trace context for distributed tracing
 */
async function idempotentEnqueue<T extends TracedJobData>(
  queue: Queue<T>,
  jobName: string,
  jobId: string,
  data: Omit<T, '_traceContext'>
): Promise<{ job: Job<T, unknown, string> | null; isNew: boolean }> {
  // Check for existing job
  const existingJob = await getExistingJob(queue, jobId);
  if (existingJob) {
    logger.debug({ jobId, jobName }, 'Job already exists, skipping enqueue');
    return { job: existingJob as Job<T, unknown, string>, isNew: false };
  }

  // Capture trace context from current span (if any)
  const traceContext = extractTraceContext();

  // Create new job with idempotency key and trace context
  const dataWithTrace = {
    ...data,
    _traceContext: traceContext,
  } as T;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = await (queue as any).add(jobName, dataWithTrace, { jobId });
  logger.debug({ jobId, jobName, hasTrace: !!traceContext }, 'Job enqueued');
  return { job: job as Job<T, unknown, string>, isNew: true };
}

export async function enqueueDocNormalize(data: DocNormalizeJobData) {
  const { docNormalize } = getQueues();
  const jobId = `normalize:${data.documentId}`;
  return idempotentEnqueue(docNormalize, jobId, jobId, data);
}

export async function enqueueDocOcr(data: DocOcrJobData) {
  const { docOcr } = getQueues();
  const jobId = `ocr:${data.documentId}:${data.pageNumber}`;
  return idempotentEnqueue(docOcr, jobId, jobId, data);
}

export async function enqueueDocExtract(data: DocExtractJobData) {
  const { docExtract } = getQueues();
  const jobId = `extract:${data.documentId}`;
  return idempotentEnqueue(docExtract, jobId, jobId, data);
}

export async function enqueueDocPostprocess(data: DocPostprocessJobData) {
  const { docPostprocess } = getQueues();
  const jobId = `postprocess:${data.documentId}:${data.extractionId}`;
  return idempotentEnqueue(docPostprocess, jobId, jobId, data);
}

export async function enqueueCategorization(data: CategorizationJobData) {
  const { categorization } = getQueues();
  // Include transaction IDs hash for uniqueness
  const txHash = data.transactionIds.slice(0, 3).join('-');
  const jobId = `categorize:${data.workspaceId}:${txHash}`;
  return idempotentEnqueue(categorization, jobId, jobId, data);
}

export async function enqueueGlPost(data: GlPostJobData) {
  const { glPost } = getQueues();
  // Include transaction count and first few IDs for uniqueness
  const txHash = data.transactionIds.slice(0, 3).join('-');
  const jobId = `gl-post:${data.workspaceId}:${txHash}`;
  return idempotentEnqueue(glPost, jobId, jobId, data);
}

export async function enqueueFxFetch(data: FxFetchJobData) {
  const { fxFetch } = getQueues();
  // Daily FX rates - include date for idempotency
  const date = new Date().toISOString().split('T')[0];
  const jobId = `fx:${data.baseCurrency}:${date}`;
  return idempotentEnqueue(fxFetch, jobId, jobId, data);
}

export async function enqueueInsightGeneration(data: InsightGenerationJobData) {
  const { insightGeneration } = getQueues();
  // Include trigger type for uniqueness
  const jobId = `insight:${data.workspaceId}:${data.triggeredBy}`;
  return idempotentEnqueue(insightGeneration, jobId, jobId, data);
}

export async function enqueueSendNotification(data: SendNotificationJobData) {
  const { sendNotification } = getQueues();
  // Include timestamp bucket (hourly) for uniqueness
  const hourBucket = new Date().toISOString().slice(0, 13);
  const jobId = `notify:${data.userId}:${data.type}:${hourBucket}`;
  return idempotentEnqueue(sendNotification, jobId, jobId, data);
}

export async function enqueueSendWeeklyDigest(data: SendWeeklyDigestJobData) {
  const { sendWeeklyDigest } = getQueues();
  // Weekly digest - include week number for idempotency
  const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const jobId = `digest:${data.workspaceId}:${data.userId}:w${weekNum}`;
  return idempotentEnqueue(sendWeeklyDigest, jobId, jobId, data);
}

// ============================================================
// Dead Letter Queue Helpers
// ============================================================

/**
 * Move a failed job to the dead letter queue
 */
export async function moveToDeadLetter(
  originalQueue: string,
  job: Job,
  error: string
): Promise<void> {
  const { deadLetter } = getQueues();

  const dlqData: DeadLetterJobData = {
    originalQueue,
    originalJobId: job.id || 'unknown',
    originalJobName: job.name,
    data: job.data,
    error,
    failedAt: new Date().toISOString(),
    attempts: job.attemptsMade,
  };

  await deadLetter.add(`dlq:${originalQueue}:${job.id}`, dlqData);

  // Track in monitoring metrics
  trackDlqJob(originalQueue, job.id || 'unknown', error);
}

/**
 * Setup DLQ event handlers for a queue
 * Automatically moves jobs to DLQ after final failure
 */
export function setupDlqHandler(queueName: string, queue: Queue): void {
  if (queueEvents[queueName]) {
    return; // Already setup
  }

  const events = new QueueEvents(queueName, { connection: getRedisConnection() });
  queueEvents[queueName] = events;

  events.on('failed', async ({ jobId, failedReason }) => {
    const job = await queue.getJob(jobId);
    if (!job) return;

    // Move to DLQ after final attempt
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      await moveToDeadLetter(queueName, job, failedReason);
    }
  });

  logger.info({ queueName }, 'DLQ handler setup');
}

// ============================================================
// Close all queues
// ============================================================

export async function closeQueues() {
  // Close queue events first
  const allEvents = Object.values(queueEvents).filter(Boolean);
  await Promise.all(allEvents.map((e) => e.close()));
  queueEvents = {};

  // Then close queues
  const allQueues = Object.values(queues).filter(Boolean) as Queue[];
  await Promise.all(allQueues.map((q) => q.close()));
  queues = {};
}
