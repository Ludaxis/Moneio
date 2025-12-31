/**
 * Batch Invoice Processor
 *
 * Processes multiple invoices in parallel with:
 * - Configurable concurrency
 * - Progress tracking
 * - Error handling and retries
 * - Result aggregation
 */

import type { LlmClient } from '../extraction/invoice-extractor';

import {
  createHighConfidenceExtractor,
  type ExtractorConfig,
  type InvoiceExtraction,
} from './high-confidence-extractor';

/**
 * Input document for batch processing
 */
export interface BatchInvoiceInput {
  id: string;
  ocrText: string;
  fileName?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of processing a single invoice
 */
export interface BatchInvoiceResult {
  id: string;
  status: 'success' | 'error' | 'skipped';
  extraction?: InvoiceExtraction;
  error?: string;
  processingTimeMs: number;
  retryCount: number;
}

/**
 * Batch processing progress
 */
export interface BatchProgress {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  inProgress: number;
  percentComplete: number;
  estimatedTimeRemainingMs: number;
}

/**
 * Batch processing configuration
 */
export interface BatchProcessorConfig {
  /** Maximum concurrent extractions */
  concurrency: number;

  /** Maximum retries per invoice */
  maxRetries: number;

  /** Delay between retries (ms) */
  retryDelayMs: number;

  /** Timeout per invoice (ms) */
  timeoutMs: number;

  /** Skip invoices that fail after retries */
  skipOnFailure: boolean;

  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void;

  /** Per-invoice completion callback */
  onInvoiceComplete?: (result: BatchInvoiceResult) => void;
}

/**
 * Default batch configuration
 */
export const DEFAULT_BATCH_CONFIG: BatchProcessorConfig = {
  concurrency: 5,
  maxRetries: 2,
  retryDelayMs: 1000,
  timeoutMs: 60000,
  skipOnFailure: true,
};

/**
 * Batch processing result
 */
export interface BatchResult {
  results: BatchInvoiceResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    averageConfidence: number;
    needsReviewCount: number;
    totalProcessingTimeMs: number;
    averageProcessingTimeMs: number;
  };
  highConfidenceResults: BatchInvoiceResult[];
  needsReviewResults: BatchInvoiceResult[];
}

/**
 * Batch Invoice Processor
 */
export class BatchInvoiceProcessor {
  private readonly config: BatchProcessorConfig;
  private readonly extractorConfig: Partial<ExtractorConfig>;

  constructor(
    private readonly llmClient: LlmClient,
    config: Partial<BatchProcessorConfig> = {},
    extractorConfig: Partial<ExtractorConfig> = {}
  ) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
    this.extractorConfig = extractorConfig;
  }

  /**
   * Process a batch of invoices
   */
  async processBatch(
    invoices: BatchInvoiceInput[],
    options?: {
      workspaceContext?: {
        companyName?: string;
        taxId?: string;
        recentVendors?: string[];
      };
    }
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const results: BatchInvoiceResult[] = [];
    const extractor = createHighConfidenceExtractor(this.llmClient, this.extractorConfig);

    // Track progress
    let completed = 0;
    let successful = 0;
    let failed = 0;
    const processingTimes: number[] = [];

    const updateProgress = () => {
      const avgTime =
        processingTimes.length > 0
          ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
          : 5000;
      const remaining = invoices.length - completed;

      const progress: BatchProgress = {
        total: invoices.length,
        completed,
        successful,
        failed,
        inProgress: Math.min(this.config.concurrency, remaining),
        percentComplete: Math.round((completed / invoices.length) * 100),
        estimatedTimeRemainingMs: Math.round((remaining / this.config.concurrency) * avgTime),
      };

      this.config.onProgress?.(progress);
    };

    // Process with concurrency control
    const processOne = async (invoice: BatchInvoiceInput): Promise<BatchInvoiceResult> => {
      const invoiceStartTime = Date.now();
      let retryCount = 0;
      let lastError: string | undefined;

      while (retryCount <= this.config.maxRetries) {
        try {
          const extraction = await this.withTimeout(
            extractor.extract(invoice.ocrText, {
              fileName: invoice.fileName,
              mimeType: invoice.mimeType,
              workspaceContext: options?.workspaceContext,
            }),
            this.config.timeoutMs
          );

          const result: BatchInvoiceResult = {
            id: invoice.id,
            status: 'success',
            extraction,
            processingTimeMs: Date.now() - invoiceStartTime,
            retryCount,
          };

          successful++;
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          retryCount++;

          if (retryCount <= this.config.maxRetries) {
            await this.delay(this.config.retryDelayMs * retryCount);
          }
        }
      }

      // All retries exhausted
      failed++;
      return {
        id: invoice.id,
        status: this.config.skipOnFailure ? 'skipped' : 'error',
        error: lastError,
        processingTimeMs: Date.now() - invoiceStartTime,
        retryCount: retryCount - 1,
      };
    };

    // Semaphore for concurrency control
    const semaphore = new Semaphore(this.config.concurrency);

    const processWithConcurrency = async (invoice: BatchInvoiceInput) => {
      await semaphore.acquire();
      try {
        const result = await processOne(invoice);
        results.push(result);
        completed++;
        processingTimes.push(result.processingTimeMs);
        updateProgress();
        this.config.onInvoiceComplete?.(result);
        return result;
      } finally {
        semaphore.release();
      }
    };

    // Initial progress
    updateProgress();

    // Process all invoices
    await Promise.all(invoices.map(processWithConcurrency));

    // Calculate summary
    const successfulResults = results.filter((r) => r.status === 'success');
    const confidences = successfulResults.map((r) => r.extraction?.overallConfidence ?? 0);
    const avgConfidence =
      confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 0;

    const needsReviewResults = successfulResults.filter((r) => r.extraction?.needsHumanReview);
    const highConfidenceResults = successfulResults.filter((r) => !r.extraction?.needsHumanReview);

    const totalProcessingTime = Date.now() - startTime;

    return {
      results,
      summary: {
        total: invoices.length,
        successful: successfulResults.length,
        failed: results.filter((r) => r.status === 'error').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        averageConfidence: avgConfidence,
        needsReviewCount: needsReviewResults.length,
        totalProcessingTimeMs: totalProcessingTime,
        averageProcessingTimeMs: Math.round(totalProcessingTime / invoices.length),
      },
      highConfidenceResults,
      needsReviewResults,
    };
  }

  /**
   * Process invoices one by one with streaming results
   */
  async *processStream(
    invoices: BatchInvoiceInput[],
    options?: {
      workspaceContext?: {
        companyName?: string;
        taxId?: string;
      };
    }
  ): AsyncGenerator<BatchInvoiceResult, void, unknown> {
    const extractor = createHighConfidenceExtractor(this.llmClient, this.extractorConfig);

    for (const invoice of invoices) {
      const startTime = Date.now();

      try {
        const extraction = await extractor.extract(invoice.ocrText, {
          fileName: invoice.fileName,
          mimeType: invoice.mimeType,
          workspaceContext: options?.workspaceContext,
        });

        yield {
          id: invoice.id,
          status: 'success',
          extraction,
          processingTimeMs: Date.now() - startTime,
          retryCount: 0,
        };
      } catch (error) {
        yield {
          id: invoice.id,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          processingTimeMs: Date.now() - startTime,
          retryCount: 0,
        };
      }
    }
  }

  /**
   * Timeout wrapper
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}

/**
 * Create batch processor
 */
export function createBatchProcessor(
  llmClient: LlmClient,
  config?: Partial<BatchProcessorConfig>,
  extractorConfig?: Partial<ExtractorConfig>
): BatchInvoiceProcessor {
  return new BatchInvoiceProcessor(llmClient, config, extractorConfig);
}

/**
 * Quick helper to process invoices with default settings
 */
export async function processInvoices(
  llmClient: LlmClient,
  invoices: BatchInvoiceInput[],
  options?: {
    concurrency?: number;
    categories?: ExtractorConfig['categories'];
    workspaceContext?: {
      companyName?: string;
      taxId?: string;
    };
    onProgress?: (progress: BatchProgress) => void;
  }
): Promise<BatchResult> {
  const processor = createBatchProcessor(
    llmClient,
    {
      concurrency: options?.concurrency ?? 5,
      onProgress: options?.onProgress,
    },
    {
      categories: options?.categories ?? [],
    }
  );

  return processor.processBatch(invoices, {
    workspaceContext: options?.workspaceContext,
  });
}
