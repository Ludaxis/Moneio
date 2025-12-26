import type { Job } from 'bullmq';
import { downloadFile } from '../services/supabase.js';

export interface DocumentNormalizeJob {
  documentId: string;
  workspaceId: string;
  storageKey: string;
  mimeType: string;
}

export interface DocumentNormalizeResult {
  documentId: string;
  pageCount: number;
  normalizedBuffer: Buffer;
}

const MAX_IMAGE_SIZE = 4096; // Max dimension for images

export async function processDocumentNormalize(
  job: Job<DocumentNormalizeJob>
): Promise<DocumentNormalizeResult> {
  const { documentId, storageKey, mimeType } = job.data;

  console.log(`[DOC_NORMALIZE] Processing document ${documentId}`);

  // Download file from Supabase Storage
  const fileBuffer = await downloadFile('documents', storageKey);

  await job.updateProgress(30);

  let pageCount = 1;
  let normalizedBuffer = fileBuffer;

  if (mimeType === 'application/pdf') {
    // For PDFs, we'll pass through and let OCR handle page extraction
    // In a real implementation, you'd use pdf-lib or similar to get page count
    pageCount = 1; // Placeholder - would extract actual page count
  } else if (mimeType.startsWith('image/')) {
    // For images, ensure they're not too large
    // In a real implementation, you'd use sharp to resize if needed
    normalizedBuffer = fileBuffer;
  }

  await job.updateProgress(100);

  console.log(`[DOC_NORMALIZE] Document ${documentId} normalized, ${pageCount} pages`);

  return {
    documentId,
    pageCount,
    normalizedBuffer,
  };
}
