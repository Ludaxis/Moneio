import { Queue } from 'bullmq';
import type { QueueOptions } from 'bullmq';

import { getRedisConnection } from './redis';

// ============================================================
// Queue Names
// ============================================================

export const QUEUE_NAMES = {
  DOC_NORMALIZE: 'doc:normalize',
  DOC_OCR: 'doc:ocr',
  DOC_EXTRACT: 'doc:extract',
  DOC_POSTPROCESS: 'doc:postprocess',
  CATEGORIZATION: 'categorization',
  FX_FETCH: 'fx:fetch',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================================
// Job Data Types
// ============================================================

export interface DocNormalizeJobData {
  documentId: string;
  workspaceId: string;
}

export interface DocOcrJobData {
  documentId: string;
  workspaceId: string;
  pageNumber: number;
  storagePath: string;
}

export interface DocExtractJobData {
  documentId: string;
  workspaceId: string;
}

export interface DocPostprocessJobData {
  documentId: string;
  workspaceId: string;
  extractionId: string;
}

export interface CategorizationJobData {
  workspaceId: string;
  transactionIds: string[];
}

export interface FxFetchJobData {
  baseCurrency: string;
  workspaceId?: string;
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

export interface FxFetchResult extends JobResult {
  baseCurrency: string;
  ratesCount: number;
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
  fxFetch?: Queue<FxFetchJobData>;
} = {};

export function getQueues() {
  if (!queues.docNormalize) {
    queues.docNormalize = createQueue<DocNormalizeJobData>(QUEUE_NAMES.DOC_NORMALIZE);
  }
  if (!queues.docOcr) {
    queues.docOcr = createQueue<DocOcrJobData>(QUEUE_NAMES.DOC_OCR);
  }
  if (!queues.docExtract) {
    queues.docExtract = createQueue<DocExtractJobData>(QUEUE_NAMES.DOC_EXTRACT);
  }
  if (!queues.docPostprocess) {
    queues.docPostprocess = createQueue<DocPostprocessJobData>(QUEUE_NAMES.DOC_POSTPROCESS);
  }
  if (!queues.categorization) {
    queues.categorization = createQueue<CategorizationJobData>(QUEUE_NAMES.CATEGORIZATION);
  }
  if (!queues.fxFetch) {
    queues.fxFetch = createQueue<FxFetchJobData>(QUEUE_NAMES.FX_FETCH);
  }

  return queues as Required<typeof queues>;
}

// ============================================================
// Queue Helpers
// ============================================================

export async function enqueueDocNormalize(data: DocNormalizeJobData) {
  const { docNormalize } = getQueues();
  return docNormalize.add(`normalize:${data.documentId}`, data, {
    jobId: `normalize:${data.documentId}`,
  });
}

export async function enqueueDocOcr(data: DocOcrJobData) {
  const { docOcr } = getQueues();
  return docOcr.add(`ocr:${data.documentId}:${data.pageNumber}`, data);
}

export async function enqueueDocExtract(data: DocExtractJobData) {
  const { docExtract } = getQueues();
  return docExtract.add(`extract:${data.documentId}`, data);
}

export async function enqueueDocPostprocess(data: DocPostprocessJobData) {
  const { docPostprocess } = getQueues();
  return docPostprocess.add(`postprocess:${data.documentId}`, data);
}

export async function enqueueCategorization(data: CategorizationJobData) {
  const { categorization } = getQueues();
  return categorization.add(`categorize:${data.workspaceId}`, data);
}

export async function enqueueFxFetch(data: FxFetchJobData) {
  const { fxFetch } = getQueues();
  return fxFetch.add(`fx:${data.baseCurrency}`, data);
}

// ============================================================
// Close all queues
// ============================================================

export async function closeQueues() {
  const allQueues = Object.values(queues).filter(Boolean) as Queue[];
  await Promise.all(allQueues.map((q) => q.close()));
  queues = {};
}
