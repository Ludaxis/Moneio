// Worker entry point - BullMQ job processor for document ingestion pipeline
import { Worker, Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { createServer } from 'http';

import {
  processDocumentNormalize,
  type DocumentNormalizeJob,
} from './jobs/document-normalize.js';
import { processDocumentOcr, type DocumentOcrJob } from './jobs/document-ocr.js';
import {
  processDocumentExtract,
  type DocumentExtractJob,
} from './jobs/document-extract.js';
import {
  processDocumentPostprocess,
  type DocumentPostprocessJob,
} from './jobs/document-postprocess.js';
import { processFxFetch, type FxFetchJob } from './jobs/fx-fetch.js';
import {
  processCategorization,
  type CategorizationJob,
} from './jobs/categorization.js';

// Redis connection
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Queue names
export const QUEUES = {
  DOC_NORMALIZE: 'doc:normalize',
  DOC_OCR: 'doc:ocr',
  DOC_EXTRACT: 'doc:extract',
  DOC_POSTPROCESS: 'doc:postprocess',
  CATEGORIZATION: 'categorization',
  FX_FETCH: 'fx:fetch',
} as const;

// Create queues with proper job options
export const docNormalizeQueue = new Queue<DocumentNormalizeJob>(QUEUES.DOC_NORMALIZE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

export const docOcrQueue = new Queue<DocumentOcrJob>(QUEUES.DOC_OCR, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

export const docExtractQueue = new Queue<DocumentExtractJob>(QUEUES.DOC_EXTRACT, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

export const docPostprocessQueue = new Queue<DocumentPostprocessJob>(
  QUEUES.DOC_POSTPROCESS,
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    },
  }
);

export const categorizationQueue = new Queue<CategorizationJob>(QUEUES.CATEGORIZATION, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

export const fxQueue = new Queue<FxFetchJob>(QUEUES.FX_FETCH, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 500,
  },
});

// Document Normalize Worker - Step 1 of pipeline
const normalizeWorker = new Worker<DocumentNormalizeJob>(
  QUEUES.DOC_NORMALIZE,
  async (job) => {
    const result = await processDocumentNormalize(job);

    // Chain to OCR step
    await docOcrQueue.add(`ocr-${result.documentId}`, {
      documentId: result.documentId,
      workspaceId: job.data.workspaceId,
      normalizedBuffer: result.normalizedBuffer,
      mimeType: job.data.mimeType,
    });

    return result;
  },
  { connection, concurrency: 5 }
);

// Document OCR Worker - Step 2 of pipeline
const ocrWorker = new Worker<DocumentOcrJob>(
  QUEUES.DOC_OCR,
  async (job) => {
    const result = await processDocumentOcr(job);

    // Chain to Extract step
    await docExtractQueue.add(`extract-${result.documentId}`, {
      documentId: result.documentId,
      workspaceId: job.data.workspaceId,
      ocrPayload: result.ocrPayload,
      locale: 'en', // TODO: Get from workspace settings
      baseCurrency: 'EUR', // TODO: Get from workspace settings
    });

    return result;
  },
  { connection, concurrency: 3 }
);

// Document Extract Worker - Step 3 of pipeline
const extractWorker = new Worker<DocumentExtractJob>(
  QUEUES.DOC_EXTRACT,
  async (job) => {
    const result = await processDocumentExtract(job);

    // Chain to Postprocess step
    await docPostprocessQueue.add(`postprocess-${result.documentId}`, {
      documentId: result.documentId,
      workspaceId: job.data.workspaceId,
      documentType: result.documentType,
      extraction: result.extraction,
      confidence: result.confidence,
    });

    return result;
  },
  { connection, concurrency: 3 }
);

// Document Postprocess Worker - Step 4 of pipeline (final step)
const postprocessWorker = new Worker<DocumentPostprocessJob>(
  QUEUES.DOC_POSTPROCESS,
  async (job) => {
    const result = await processDocumentPostprocess(job);
    // TODO: Update document status to 'ready' in database
    return result;
  },
  { connection, concurrency: 5 }
);

// Categorization Worker - For transaction categorization
const categorizationWorker = new Worker<CategorizationJob>(
  QUEUES.CATEGORIZATION,
  async (job) => {
    return await processCategorization(job);
  },
  { connection, concurrency: 3 }
);

// FX Fetch Worker - For exchange rate updates
const fxWorker = new Worker<FxFetchJob>(
  QUEUES.FX_FETCH,
  async (job) => {
    return await processFxFetch(job);
  },
  { connection, concurrency: 1 }
);

// Worker registry for event handling and shutdown
const workers = [
  { name: 'normalize', worker: normalizeWorker },
  { name: 'ocr', worker: ocrWorker },
  { name: 'extract', worker: extractWorker },
  { name: 'postprocess', worker: postprocessWorker },
  { name: 'categorization', worker: categorizationWorker },
  { name: 'fx', worker: fxWorker },
];

// Set up event handlers for all workers
for (const { name, worker } of workers) {
  worker.on('completed', (job) => {
    console.log(`[${name.toUpperCase()}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[${name.toUpperCase()}] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`[${name.toUpperCase()}] Worker error:`, err.message);
  });
}

// Graceful shutdown handler
const shutdown = async () => {
  console.log('Shutting down workers...');

  try {
    await Promise.all(workers.map(({ worker }) => worker.close()));
    await connection.quit();
    console.log('Workers shut down gracefully');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Schedule recurring FX rate updates
const scheduleFxUpdates = async () => {
  // Remove existing repeatable jobs first to prevent duplicates
  const repeatableJobs = await fxQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await fxQueue.removeRepeatableByKey(job.key);
  }

  // Schedule hourly FX updates for common currencies
  const currencies = ['EUR', 'USD', 'GBP'];

  for (const currency of currencies) {
    await fxQueue.add(
      `fx-${currency.toLowerCase()}`,
      { baseCurrency: currency },
      {
        repeat: {
          every: 60 * 60 * 1000, // 1 hour
        },
      }
    );
  }

  console.log('FX update jobs scheduled for:', currencies.join(', '));
};

// Health check HTTP endpoint
const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        workers: workers.length,
        timestamp: new Date().toISOString(),
      })
    );
  } else if (req.url === '/metrics') {
    // TODO: Add Prometheus-style metrics
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('# Metrics endpoint\n');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT || 3002;
healthServer.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

// Startup logging
console.log('='.repeat(50));
console.log('Moneio Worker Service');
console.log('='.repeat(50));
console.log(`Redis: ${REDIS_URL}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('');
console.log('Active Workers:');
for (const { name, worker } of workers) {
  console.log(`  - ${name} (concurrency: ${worker.opts.concurrency})`);
}
console.log('');

// Initialize scheduled jobs
scheduleFxUpdates().catch((err) => {
  console.error('Failed to schedule FX updates:', err);
});

console.log('Workers started and ready to process jobs');
console.log('='.repeat(50));
