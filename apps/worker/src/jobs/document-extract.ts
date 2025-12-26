import type { Job } from 'bullmq';
import type { OcrPayload } from '@moneio/core-ledger';
import { extractInvoiceData, type InvoiceExtraction } from '../services/openai.js';

export interface DocumentExtractJob {
  documentId: string;
  workspaceId: string;
  ocrPayload: OcrPayload;
  locale: string;
  baseCurrency: string;
}

export interface DocumentExtractResult {
  documentId: string;
  documentType: 'invoice' | 'receipt' | 'statement' | 'other';
  extraction: InvoiceExtraction;
  confidence: number;
  modelInfo: string;
}

export async function processDocumentExtract(
  job: Job<DocumentExtractJob>
): Promise<DocumentExtractResult> {
  const { documentId, ocrPayload, locale, baseCurrency } = job.data;

  console.log(`[DOC_EXTRACT] Processing extraction for document ${documentId}`);

  await job.updateProgress(10);

  const { extraction, confidence, modelInfo } = await extractInvoiceData(
    ocrPayload,
    locale,
    baseCurrency
  );

  await job.updateProgress(100);

  console.log(
    `[DOC_EXTRACT] Extraction complete for document ${documentId}, ` +
      `type: ${extraction.documentType}, confidence: ${confidence}%`
  );

  return {
    documentId,
    documentType: extraction.documentType,
    extraction,
    confidence,
    modelInfo,
  };
}
