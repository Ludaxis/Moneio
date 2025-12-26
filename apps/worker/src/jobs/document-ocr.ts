import type { Job } from 'bullmq';
import type { OcrPayload } from '@moneio/core-ledger';
import { performOcr } from '../services/ocr.js';

export interface DocumentOcrJob {
  documentId: string;
  workspaceId: string;
  normalizedBuffer: Buffer;
  mimeType: string;
}

export interface DocumentOcrResult {
  documentId: string;
  ocrPayload: OcrPayload;
}

export async function processDocumentOcr(
  job: Job<DocumentOcrJob>
): Promise<DocumentOcrResult> {
  const { documentId, normalizedBuffer, mimeType } = job.data;

  console.log(`[DOC_OCR] Processing OCR for document ${documentId}`);

  await job.updateProgress(10);

  let ocrPayload: OcrPayload;

  if (mimeType === 'application/pdf') {
    // For PDFs, we'd need to convert each page to image first
    // For now, we'll use a simplified approach
    // In production, use pdf2pic or similar
    ocrPayload = await performOcr(normalizedBuffer);
  } else {
    // For images, directly process
    ocrPayload = await performOcr(normalizedBuffer);
  }

  await job.updateProgress(100);

  console.log(
    `[DOC_OCR] OCR complete for document ${documentId}, extracted ${ocrPayload.fullText.length} chars`
  );

  return {
    documentId,
    ocrPayload,
  };
}
