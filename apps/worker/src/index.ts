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
import { logger } from './lib/logger';
import { attachMonitoring, getMetrics, isHealthy } from './lib/monitoring';
import { QUEUE_NAMES, getQueues, closeQueues } from './lib/queues';
import { getRedisConnection, closeRedisConnection } from './lib/redis';

// ============================================================
// Configuration
// ============================================================

const config = {
  concurrency: {
    docNormalize: parseInt(process.env.DOC_NORMALIZE_CONCURRENCY || '2'),
    docOcr: parseInt(process.env.DOC_OCR_CONCURRENCY || '3'),
    docExtract: parseInt(process.env.DOC_EXTRACT_CONCURRENCY || '2'),
    docPostprocess: parseInt(process.env.DOC_POSTPROCESS_CONCURRENCY || '2'),
    categorization: parseInt(process.env.CATEGORIZATION_CONCURRENCY || '2'),
    fxFetch: parseInt(process.env.FX_FETCH_CONCURRENCY || '1'),
  },
};

// Upstash-optimized worker settings to minimize Redis requests
// Default BullMQ polls every 5ms when idle - this is too aggressive for Upstash pricing
const workerSettings = {
  // How long to wait between polling when queue is empty (default: 5ms!)
  drainDelay: 30000, // 30 seconds - drastically reduces idle polling
  // How often to check for stalled jobs (default: 30000ms)
  stalledInterval: 300000, // 5 minutes
  // How long a job can run before considered stalled (default: 30000ms)
  lockDuration: 300000, // 5 minutes
  // Max stalled job checks per run
  maxStalledCount: 1,
};

// ============================================================
// Worker Creation
// ============================================================

const connection = getRedisConnection();

const workers: Worker[] = [];

// DOC_NORMALIZE Worker
const docNormalizeWorker = new Worker(QUEUE_NAMES.DOC_NORMALIZE, handleDocNormalize, {
  connection,
  concurrency: config.concurrency.docNormalize,
  ...workerSettings,
});
workers.push(docNormalizeWorker);

// DOC_OCR Worker
const docOcrWorker = new Worker(QUEUE_NAMES.DOC_OCR, handleDocOcr, {
  connection,
  concurrency: config.concurrency.docOcr,
  ...workerSettings,
});
workers.push(docOcrWorker);

// DOC_EXTRACT Worker
const docExtractWorker = new Worker(QUEUE_NAMES.DOC_EXTRACT, handleDocExtract, {
  connection,
  concurrency: config.concurrency.docExtract,
  ...workerSettings,
});
workers.push(docExtractWorker);

// DOC_POSTPROCESS Worker
const docPostprocessWorker = new Worker(QUEUE_NAMES.DOC_POSTPROCESS, handleDocPostprocess, {
  connection,
  concurrency: config.concurrency.docPostprocess,
  ...workerSettings,
});
workers.push(docPostprocessWorker);

// CATEGORIZATION Worker
const categorizationWorker = new Worker(QUEUE_NAMES.CATEGORIZATION, handleCategorization, {
  connection,
  concurrency: config.concurrency.categorization,
  ...workerSettings,
});
workers.push(categorizationWorker);

// FX_FETCH Worker
const fxFetchWorker = new Worker(QUEUE_NAMES.FX_FETCH, handleFxFetch, {
  connection,
  concurrency: config.concurrency.fxFetch,
  ...workerSettings,
});
workers.push(fxFetchWorker);

// ============================================================
// Attach Monitoring to All Workers
// ============================================================

for (const worker of workers) {
  attachMonitoring(worker);
}

// ============================================================
// Scheduled Jobs
// ============================================================

async function scheduleRecurringJobs() {
  // Skip recurring jobs if DISABLE_RECURRING_JOBS is set
  if (process.env.DISABLE_RECURRING_JOBS === 'true') {
    console.log('[SCHEDULER] Recurring jobs disabled via env');
    return;
  }

  const { fxFetch } = getQueues();

  // Schedule daily FX updates for common currencies (reduced from hourly)
  // This significantly reduces Redis requests from repeat job polling
  const currencies = ['EUR', 'USD', 'GBP'];

  for (const currency of currencies) {
    await fxFetch.add(
      `fx-${currency}-daily`,
      { baseCurrency: currency },
      {
        repeat: {
          every: 24 * 60 * 60 * 1000, // Once per day (was hourly!)
        },
        jobId: `fx-${currency}-daily`,
      }
    );
  }

  console.log('[SCHEDULER] Recurring jobs scheduled (daily FX updates)');
}

// ============================================================
// Graceful Shutdown
// ============================================================

async function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal');

  // Log final metrics
  const finalMetrics = getMetrics();
  logger.info({ metrics: finalMetrics }, 'Final worker metrics');

  // Close workers
  await Promise.all(workers.map((w) => w.close()));
  logger.info('Workers closed');

  // Close queues
  await closeQueues();
  logger.info('Queues closed');

  // Close Redis
  await closeRedisConnection();
  logger.info('Redis disconnected');

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================
// Periodic Metrics Logging
// ============================================================

// Reduced from 1 minute to 5 minutes to reduce log noise
const METRICS_LOG_INTERVAL = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const metrics = getMetrics();
  const health = isHealthy();

  logger.info(
    {
      uptime: Math.round(metrics.uptime / 1000),
      healthy: health.healthy,
      queues: metrics.queues,
    },
    'Worker metrics'
  );

  if (!health.healthy) {
    logger.warn({ reason: health.reason }, 'Worker unhealthy');
  }
}, METRICS_LOG_INTERVAL);

// ============================================================
// Startup
// ============================================================

logger.info(
  {
    concurrency: config.concurrency,
    queues: Object.values(QUEUE_NAMES),
  },
  'Moneio Worker Service started'
);

console.log('');
console.log('═══════════════════════════════════════════');
console.log('       Moneio Worker Service Started       ');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('Workers:');
console.log(`  • DOC_NORMALIZE   (concurrency: ${config.concurrency.docNormalize})`);
console.log(`  • DOC_OCR         (concurrency: ${config.concurrency.docOcr})`);
console.log(`  • DOC_EXTRACT     (concurrency: ${config.concurrency.docExtract})`);
console.log(`  • DOC_POSTPROCESS (concurrency: ${config.concurrency.docPostprocess})`);
console.log(`  • CATEGORIZATION  (concurrency: ${config.concurrency.categorization})`);
console.log(`  • FX_FETCH        (concurrency: ${config.concurrency.fxFetch})`);
console.log('');
console.log('Press Ctrl+C to stop');
console.log('');

scheduleRecurringJobs().catch((err) => logger.error({ err }, 'Failed to schedule recurring jobs'));
