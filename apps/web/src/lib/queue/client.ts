/**
 * Queue client for enqueueing jobs from the web app
 *
 * Optimized for Upstash Redis to minimize request count:
 * - Lazy connection initialization
 * - No automatic connection on import
 * - Single connection reused across all queues
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Queue names - must match worker
export const QUEUE_NAMES = {
  DOC_NORMALIZE: 'doc-normalize',
  DOC_OCR: 'doc-ocr',
  DOC_EXTRACT: 'doc-extract',
  DOC_POSTPROCESS: 'doc-postprocess',
  CATEGORIZATION: 'categorization',
  FX_FETCH: 'fx-fetch',
} as const;

// Job data types
export interface DocNormalizeJobData {
  documentId: string;
  workspaceId: string;
}

export interface CategorizationJobData {
  workspaceId: string;
  transactionIds: string[];
}

// Singleton connection - only created when first job is enqueued
let connection: IORedis | null = null;

function getConnection() {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

    if (!redisUrl) {
      console.warn('REDIS_URL not configured, queue operations will be skipped');
      return null;
    }

    const isUpstash = redisUrl.includes('upstash.io');

    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // Optimize for Upstash - minimize connection overhead
      lazyConnect: true,
      ...(isUpstash && {
        tls: {
          rejectUnauthorized: false,
        },
      }),
    });
  }
  return connection;
}

// Queue instances - created lazily
let docNormalizeQueue: Queue<DocNormalizeJobData> | null = null;
let categorizationQueue: Queue<CategorizationJobData> | null = null;

// Shared queue options optimized for Upstash
const queueOptions = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // Increased from 2s to reduce retry spam
    },
    // Clean up completed/failed jobs to reduce Redis storage
    removeOnComplete: 50,
    removeOnFail: 100,
  },
};

function getDocNormalizeQueue() {
  const conn = getConnection();
  if (!conn) return null;

  if (!docNormalizeQueue) {
    docNormalizeQueue = new Queue<DocNormalizeJobData>(QUEUE_NAMES.DOC_NORMALIZE, {
      connection: conn,
      ...queueOptions,
    });
  }
  return docNormalizeQueue;
}

function getCategorizationQueue() {
  const conn = getConnection();
  if (!conn) return null;

  if (!categorizationQueue) {
    categorizationQueue = new Queue<CategorizationJobData>(QUEUE_NAMES.CATEGORIZATION, {
      connection: conn,
      ...queueOptions,
    });
  }
  return categorizationQueue;
}

/**
 * Enqueue a document for normalization (pipeline entry point)
 */
export async function enqueueDocNormalize(data: DocNormalizeJobData): Promise<string | null> {
  const queue = getDocNormalizeQueue();

  if (!queue) {
    console.log(`[QUEUE STUB] DOC_NORMALIZE queued for document: ${data.documentId}`);
    return null;
  }

  const job = await queue.add(`normalize-${data.documentId}`, data, {
    jobId: `normalize-${data.documentId}`,
  });

  console.log(`[QUEUE] DOC_NORMALIZE job ${job.id} queued for document: ${data.documentId}`);
  return job.id || null;
}

/**
 * Enqueue transactions for AI categorization
 */
export async function enqueueCategorization(data: CategorizationJobData): Promise<string | null> {
  const queue = getCategorizationQueue();

  if (!queue) {
    console.log(
      `[QUEUE STUB] CATEGORIZATION queued for ${data.transactionIds.length} transactions`
    );
    return null;
  }

  const job = await queue.add(`categorize-${data.workspaceId}`, data);

  console.log(
    `[QUEUE] CATEGORIZATION job ${job.id} queued for ${data.transactionIds.length} transactions`
  );
  return job.id || null;
}
