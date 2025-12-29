import {
  createOpenAiClient,
  InvoiceExtractor,
  ReceiptExtractor,
  StatementExtractor,
} from '@moneio/ai';
import type { OcrPayload, OcrPage, OcrBlock } from '@moneio/core-ledger';
import { prisma, DocumentStatus } from '@moneio/db';
import { getDocumentType } from '@moneio/domain';
import { Job } from 'bullmq';

import type { DocExtractJobData, DocExtractResult } from '../lib/queues';
import { enqueueDocPostprocess } from '../lib/queues';

/**
 * DOC_EXTRACT handler
 *
 * Pipeline step 3: Extract structured data using LLM
 * - Gather all OCR artifacts for the document
 * - Detect document type based on content
 * - Send to OpenAI for structured extraction
 * - Validate output with Zod schema
 * - Store extraction in extractions table
 * - Enqueue postprocessing
 */
export async function handleDocExtract(job: Job<DocExtractJobData>): Promise<DocExtractResult> {
  const { documentId, workspaceId } = job.data;

  console.log(`[DOC_EXTRACT] Processing document ${documentId}`);

  try {
    // Update status
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.extracting },
    });

    await job.updateProgress(10);

    // Get OCR artifacts
    const ocrArtifacts = await prisma.ocrArtifact.findMany({
      where: { documentId },
      orderBy: { pageNumber: 'asc' },
    });

    if (ocrArtifacts.length === 0) {
      throw new Error('No OCR artifacts found');
    }

    await job.updateProgress(20);

    // Get workspace context
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        categories: {
          where: { isSystem: true },
          select: { name: true },
        },
      },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Build OcrPayload from artifacts
    const ocrPayload = buildOcrPayload(ocrArtifacts);

    await job.updateProgress(30);

    // Detect document type using domain service
    const docType = getDocumentType(ocrPayload);
    console.log(`[DOC_EXTRACT] Detected document type: ${docType}`);

    await job.updateProgress(40);

    // Create OpenAI client
    const llmClient = createOpenAiClient();

    // Build workspace context
    const context = {
      workspaceId,
      locale: workspace.locale,
      baseCurrency: workspace.baseCurrency,
      categoryNames: workspace.categories.map((c: { name: string }) => c.name),
    };

    // Extract based on document type
    let extraction;
    let extractionPayload: Record<string, unknown>;

    if (docType === 'invoice') {
      const extractor = new InvoiceExtractor(llmClient);
      extraction = await extractor.extractInvoice(ocrPayload, context);
      extractionPayload = {
        ...extraction.data,
        _confidence: extraction.confidence,
        _modelInfo: extraction.modelInfo,
        _evidence: extraction.evidence,
      };
    } else if (docType === 'receipt') {
      const extractor = new ReceiptExtractor(llmClient);
      extraction = await extractor.extractReceipt(ocrPayload, context);
      extractionPayload = {
        ...extraction.data,
        _confidence: extraction.confidence,
        _modelInfo: extraction.modelInfo,
        _evidence: extraction.evidence,
      };
    } else if (docType === 'bank_statement') {
      const extractor = new StatementExtractor(llmClient);
      extraction = await extractor.extractStatement(ocrPayload, context);
      extractionPayload = {
        ...extraction.data,
        _confidence: extraction.confidence,
        _modelInfo: extraction.modelInfo,
        _evidence: extraction.evidence,
      };
    } else {
      // Default to invoice for unknown types
      const extractor = new InvoiceExtractor(llmClient);
      extraction = await extractor.extractInvoice(ocrPayload, context);
      extractionPayload = {
        ...extraction.data,
        kind: 'other',
        _confidence: extraction.confidence,
        _modelInfo: extraction.modelInfo,
        _evidence: extraction.evidence,
      };
    }

    await job.updateProgress(70);

    // Get current version number
    const latestExtraction = await prisma.extraction.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = (latestExtraction?.version || 0) + 1;

    // Store extraction
    const savedExtraction = await prisma.extraction.create({
      data: {
        documentId,
        version: nextVersion,
        payloadJson: JSON.parse(JSON.stringify(extractionPayload)),
        approved: false,
      },
    });

    // Update document type
    await prisma.document.update({
      where: { id: documentId },
      data: {
        docType: docType as 'invoice' | 'receipt' | 'bank_statement' | 'other',
      },
    });

    await job.updateProgress(85);

    // Enqueue postprocessing
    await enqueueDocPostprocess({
      documentId,
      workspaceId,
      extractionId: savedExtraction.id,
    });

    await job.updateProgress(100);

    console.log(
      `[DOC_EXTRACT] Document ${documentId} extraction v${nextVersion} created ` +
        `(${docType}, confidence: ${extraction.confidence}%)`
    );

    return {
      success: true,
      documentId,
      extractionId: savedExtraction.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DOC_EXTRACT] Failed for ${documentId}:`, errorMessage);

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.failed,
        failReason: `Extraction failed: ${errorMessage}`,
      },
    });

    return {
      success: false,
      documentId,
      error: errorMessage,
    };
  }
}

/**
 * Build OcrPayload from Prisma OcrArtifact records
 */
function buildOcrPayload(
  artifacts: Array<{
    pageNumber: number;
    payloadJson: unknown;
  }>
): OcrPayload {
  const pages: OcrPage[] = artifacts.map((artifact) => {
    const payload = artifact.payloadJson as {
      text?: string;
      blocks?: Array<{
        text: string;
        confidence?: number;
        boundingBox?: { vertices: Array<{ x: number; y: number }> };
        paragraphs?: Array<{
          text: string;
          confidence?: number;
          words?: Array<{
            text: string;
            confidence?: number;
            boundingBox?: { vertices: Array<{ x: number; y: number }> };
          }>;
        }>;
      }>;
      confidence?: number;
      language?: string;
    };

    const blocks: OcrBlock[] = (payload.blocks || []).map((block) => ({
      text: block.text,
      confidence: block.confidence || 0,
      type: 'text' as const,
      boundingBox: {
        x: block.boundingBox?.vertices[0]?.x || 0,
        y: block.boundingBox?.vertices[0]?.y || 0,
        width: (block.boundingBox?.vertices[1]?.x || 0) - (block.boundingBox?.vertices[0]?.x || 0),
        height: (block.boundingBox?.vertices[2]?.y || 0) - (block.boundingBox?.vertices[0]?.y || 0),
      },
    }));

    return {
      pageNumber: artifact.pageNumber,
      width: 0, // Not stored in OCR artifacts
      height: 0,
      text: payload.text || '',
      blocks,
    };
  });

  return { pages };
}

