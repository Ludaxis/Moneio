// Worker entry point
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Queue names
export const QUEUES = {
  DOCUMENT_PROCESS: 'document:process',
  DOCUMENT_OCR: 'document:ocr',
  DOCUMENT_EXTRACT: 'document:extract',
  CATEGORIZATION: 'categorization',
  INDEXING: 'indexing',
  FX_RATES: 'fx:rates',
} as const;

// Job types
interface DocumentProcessJob {
  documentId: string;
  workspaceId: string;
  storageKey: string;
  mimeType: string;
}

interface CategorizationJob {
  transactionIds: string[];
  workspaceId: string;
}

interface FxRatesJob {
  baseCurrency: string;
}

// Create queues
export const documentQueue = new Queue<DocumentProcessJob>(QUEUES.DOCUMENT_PROCESS, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

export const categorizationQueue = new Queue<CategorizationJob>(QUEUES.CATEGORIZATION, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
  },
});

export const fxQueue = new Queue<FxRatesJob>(QUEUES.FX_RATES, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// Document processing worker
const documentWorker = new Worker<DocumentProcessJob>(
  QUEUES.DOCUMENT_PROCESS,
  async (job: Job<DocumentProcessJob>) => {
    console.log(`Processing document ${job.data.documentId}`);

    try {
      // TODO: Implement ingestion pipeline
      // const pipeline = new IngestionPipeline(...);
      // await pipeline.process(
      //   job.data.documentId,
      //   job.data.workspaceId,
      //   job.data.mimeType,
      //   job.data.storageKey
      // );

      await job.updateProgress(100);
      return { success: true, documentId: job.data.documentId };
    } catch (error) {
      console.error(`Document processing failed: ${error}`);
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

// Categorization worker
const categorizationWorker = new Worker<CategorizationJob>(
  QUEUES.CATEGORIZATION,
  async (job: Job<CategorizationJob>) => {
    console.log(`Categorizing ${job.data.transactionIds.length} transactions`);

    try {
      // TODO: Implement AI categorization
      // const categorizer = new TransactionCategorizer(llmClient);
      // await categorizer.categorizeTransactions(transactions, categories, context);

      return {
        success: true,
        categorized: job.data.transactionIds.length,
      };
    } catch (error) {
      console.error(`Categorization failed: ${error}`);
      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

// FX rates worker
const fxWorker = new Worker<FxRatesJob>(
  QUEUES.FX_RATES,
  async (job: Job<FxRatesJob>) => {
    console.log(`Fetching FX rates for ${job.data.baseCurrency}`);

    try {
      // TODO: Implement FX rate fetching
      // const rates = await fxService.fetchRates(job.data.baseCurrency);
      // await fxRepository.saveRates(rates);

      return { success: true, baseCurrency: job.data.baseCurrency };
    } catch (error) {
      console.error(`FX rate fetch failed: ${error}`);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

// Event handlers
documentWorker.on('completed', (job) => {
  console.log(`Document job ${job.id} completed`);
});

documentWorker.on('failed', (job, err) => {
  console.error(`Document job ${job?.id} failed:`, err);
});

categorizationWorker.on('completed', (job) => {
  console.log(`Categorization job ${job.id} completed`);
});

fxWorker.on('completed', (job) => {
  console.log(`FX job ${job.id} completed`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down workers...');
  await documentWorker.close();
  await categorizationWorker.close();
  await fxWorker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Workers started');
console.log(`- Document worker (concurrency: 5)`);
console.log(`- Categorization worker (concurrency: 3)`);
console.log(`- FX rates worker (concurrency: 1)`);

// Schedule recurring FX rate updates
const scheduleFxUpdates = async () => {
  // Schedule hourly FX updates
  await fxQueue.add(
    'update-eur',
    { baseCurrency: 'EUR' },
    {
      repeat: {
        every: 60 * 60 * 1000, // 1 hour
      },
    }
  );

  await fxQueue.add(
    'update-usd',
    { baseCurrency: 'USD' },
    {
      repeat: {
        every: 60 * 60 * 1000,
      },
    }
  );
};

scheduleFxUpdates().catch(console.error);
