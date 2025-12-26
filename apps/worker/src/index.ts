/**
 * Moneio Worker Service
 *
 * Background job processor for document ingestion pipeline,
 * AI categorization, and FX rate fetching.
 */

import { Worker } from 'bullmq';

import {
  handleDocNormalize,
  handleDocOcr,
  handleDocExtract,
  handleDocPostprocess,
  handleCategorization,
  handleFxFetch,
} from './handlers';
import { QUEUE_NAMES, getQueues, closeQueues } from './lib/queues';
import { getRedisConnection, closeRedisConnection } from './lib/redis';

// ============================================================
// Configuration
// ============================================================

const config = {
  concurrency: {
    docNormalize: parseInt(process.env.DOC_NORMALIZE_CONCURRENCY || '5'),
    docOcr: parseInt(process.env.DOC_OCR_CONCURRENCY || '10'),
    docExtract: parseInt(process.env.DOC_EXTRACT_CONCURRENCY || '3'),
    docPostprocess: parseInt(process.env.DOC_POSTPROCESS_CONCURRENCY || '5'),
    categorization: parseInt(process.env.CATEGORIZATION_CONCURRENCY || '3'),
    fxFetch: parseInt(process.env.FX_FETCH_CONCURRENCY || '1'),
  },
};

// ============================================================
// Worker Creation
// ============================================================

const connection = getRedisConnection();

const workers: Worker[] = [];

// DOC_NORMALIZE Worker
const docNormalizeWorker = new Worker(
  QUEUE_NAMES.DOC_NORMALIZE,
  handleDocNormalize,
  {
    connection,
    concurrency: config.concurrency.docNormalize,
  }
);
workers.push(docNormalizeWorker);

// DOC_OCR Worker
const docOcrWorker = new Worker(
  QUEUE_NAMES.DOC_OCR,
  handleDocOcr,
  {
    connection,
    concurrency: config.concurrency.docOcr,
  }
);
workers.push(docOcrWorker);

// DOC_EXTRACT Worker
const docExtractWorker = new Worker(
  QUEUE_NAMES.DOC_EXTRACT,
  handleDocExtract,
  {
    connection,
    concurrency: config.concurrency.docExtract,
  }
);
workers.push(docExtractWorker);

// DOC_POSTPROCESS Worker
const docPostprocessWorker = new Worker(
  QUEUE_NAMES.DOC_POSTPROCESS,
  handleDocPostprocess,
  {
    connection,
    concurrency: config.concurrency.docPostprocess,
  }
);
workers.push(docPostprocessWorker);

// CATEGORIZATION Worker
const categorizationWorker = new Worker(
  QUEUE_NAMES.CATEGORIZATION,
  handleCategorization,
  {
    connection,
    concurrency: config.concurrency.categorization,
  }
);
workers.push(categorizationWorker);

// FX_FETCH Worker
const fxFetchWorker = new Worker(
  QUEUE_NAMES.FX_FETCH,
  handleFxFetch,
  {
    connection,
    concurrency: config.concurrency.fxFetch,
  }
);
workers.push(fxFetchWorker);

// ============================================================
// Event Handlers
// ============================================================

for (const worker of workers) {
  worker.on('completed', (job) => {
    console.log(`[${worker.name}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[${worker.name}] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`[${worker.name}] Worker error:`, err.message);
  });
}

// ============================================================
// Scheduled Jobs
// ============================================================

async function scheduleRecurringJobs() {
  const { fxFetch } = getQueues();

  // Schedule hourly FX updates for common currencies
  const currencies = ['EUR', 'USD', 'GBP'];

  for (const currency of currencies) {
    await fxFetch.add(
      `fx:${currency}:hourly`,
      { baseCurrency: currency },
      {
        repeat: {
          every: 60 * 60 * 1000, // 1 hour
        },
        jobId: `fx:${currency}:hourly`,
      }
    );
  }

  console.log('[SCHEDULER] Recurring jobs scheduled');
}

// ============================================================
// Graceful Shutdown
// ============================================================

async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`);

  // Close workers
  await Promise.all(workers.map((w) => w.close()));
  console.log('Workers closed');

  // Close queues
  await closeQueues();
  console.log('Queues closed');

  // Close Redis
  await closeRedisConnection();
  console.log('Redis disconnected');

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================
// Startup
// ============================================================

console.log('');
console.log('═══════════════════════════════════════════');
console.log('       Moneio Worker Service Started       ');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('Workers:');
console.log(`  • DOC_NORMALIZE  (concurrency: ${config.concurrency.docNormalize})`);
console.log(`  • DOC_OCR        (concurrency: ${config.concurrency.docOcr})`);
console.log(`  • DOC_EXTRACT    (concurrency: ${config.concurrency.docExtract})`);
console.log(`  • DOC_POSTPROCESS (concurrency: ${config.concurrency.docPostprocess})`);
console.log(`  • CATEGORIZATION (concurrency: ${config.concurrency.categorization})`);
console.log(`  • FX_FETCH       (concurrency: ${config.concurrency.fxFetch})`);
console.log('');
console.log('Press Ctrl+C to stop');
console.log('');

scheduleRecurringJobs().catch(console.error);
