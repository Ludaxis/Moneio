// Document ingestion pipeline
import type { DocumentType, ExtractionPayload, OcrPayload, UUID } from '@moneio/core-ledger';

// Pipeline state machine
export type PipelineState =
  | 'uploaded'
  | 'normalizing'
  | 'ocr'
  | 'extracting'
  | 'postprocessing'
  | 'indexing'
  | 'ready'
  | 'failed';

export interface PipelineContext {
  documentId: UUID;
  workspaceId: UUID;
  state: PipelineState;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface PipelineResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  shouldRetry?: boolean;
}

// Job definitions
export interface NormalizeJob {
  type: 'DOC_NORMALIZE';
  documentId: UUID;
  mimeType: string;
  storageKey: string;
}

export interface OcrJob {
  type: 'DOC_OCR';
  documentId: UUID;
  storageKey: string;
}

export interface ExtractJob {
  type: 'DOC_EXTRACT';
  documentId: UUID;
  ocrPayload: OcrPayload;
  detectedType?: DocumentType;
}

export interface PostProcessJob {
  type: 'DOC_POSTPROCESS';
  documentId: UUID;
  workspaceId: UUID;
  extraction: ExtractionPayload;
}

export interface IndexJob {
  type: 'DOC_INDEX';
  documentId: UUID;
  workspaceId: UUID;
}

export type PipelineJob = NormalizeJob | OcrJob | ExtractJob | PostProcessJob | IndexJob;

// Pipeline step interfaces
export interface NormalizeStep {
  execute(job: NormalizeJob): Promise<PipelineResult<{ storageKey: string; pageCount: number }>>;
}

export interface OcrStep {
  execute(job: OcrJob): Promise<PipelineResult<OcrPayload>>;
}

export interface ExtractStep {
  execute(job: ExtractJob): Promise<PipelineResult<{ extraction: ExtractionPayload; confidence: number }>>;
}

export interface PostProcessStep {
  execute(job: PostProcessJob): Promise<PipelineResult<{
    merchantId?: UUID;
    categoryIds?: UUID[];
    matchSuggestions?: UUID[];
  }>>;
}

export interface IndexStep {
  execute(job: IndexJob): Promise<PipelineResult<void>>;
}

// Pipeline orchestrator
export class IngestionPipeline {
  constructor(
    private readonly normalizeStep: NormalizeStep,
    private readonly ocrStep: OcrStep,
    private readonly extractStep: ExtractStep,
    private readonly postProcessStep: PostProcessStep,
    private readonly indexStep: IndexStep,
    private readonly onStateChange: (ctx: PipelineContext) => Promise<void>
  ) {}

  async process(documentId: UUID, workspaceId: UUID, mimeType: string, storageKey: string): Promise<void> {
    const ctx: PipelineContext = {
      documentId,
      workspaceId,
      state: 'uploaded',
      retryCount: 0,
      maxRetries: 3,
    };

    try {
      // Step 1: Normalize
      ctx.state = 'normalizing';
      await this.onStateChange(ctx);
      const normalizeResult = await this.executeWithRetry(
        () => this.normalizeStep.execute({ type: 'DOC_NORMALIZE', documentId, mimeType, storageKey }),
        ctx
      );
      if (!normalizeResult.success || !normalizeResult.data) {
        throw new Error(normalizeResult.error || 'Normalization failed');
      }

      // Step 2: OCR
      ctx.state = 'ocr';
      await this.onStateChange(ctx);
      const ocrResult = await this.executeWithRetry(
        () => this.ocrStep.execute({ type: 'DOC_OCR', documentId, storageKey: normalizeResult.data!.storageKey }),
        ctx
      );
      if (!ocrResult.success || !ocrResult.data) {
        throw new Error(ocrResult.error || 'OCR failed');
      }

      // Step 3: Extract
      ctx.state = 'extracting';
      await this.onStateChange(ctx);
      const extractResult = await this.executeWithRetry(
        () => this.extractStep.execute({ type: 'DOC_EXTRACT', documentId, ocrPayload: ocrResult.data! }),
        ctx
      );
      if (!extractResult.success || !extractResult.data) {
        throw new Error(extractResult.error || 'Extraction failed');
      }

      // Step 4: Post-process
      ctx.state = 'postprocessing';
      await this.onStateChange(ctx);
      await this.executeWithRetry(
        () => this.postProcessStep.execute({
          type: 'DOC_POSTPROCESS',
          documentId,
          workspaceId,
          extraction: extractResult.data!.extraction,
        }),
        ctx
      );

      // Step 5: Index (optional, can fail silently)
      ctx.state = 'indexing';
      await this.onStateChange(ctx);
      try {
        await this.indexStep.execute({ type: 'DOC_INDEX', documentId, workspaceId });
      } catch {
        // Indexing failure is non-critical
        console.warn(`Indexing failed for document ${documentId}, continuing...`);
      }

      // Done
      ctx.state = 'ready';
      await this.onStateChange(ctx);
    } catch (error) {
      ctx.state = 'failed';
      ctx.error = error instanceof Error ? error.message : 'Unknown error';
      await this.onStateChange(ctx);
      throw error;
    }
  }

  private async executeWithRetry<T>(
    fn: () => Promise<PipelineResult<T>>,
    ctx: PipelineContext
  ): Promise<PipelineResult<T>> {
    let lastResult: PipelineResult<T> | undefined;

    for (let attempt = 0; attempt <= ctx.maxRetries; attempt++) {
      ctx.retryCount = attempt;
      lastResult = await fn();

      if (lastResult.success || !lastResult.shouldRetry) {
        return lastResult;
      }

      if (attempt < ctx.maxRetries) {
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    return lastResult!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
