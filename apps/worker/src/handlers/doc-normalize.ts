import { Job } from 'bullmq';
import { prisma, DocumentStatus } from '@moneio/db';

import type { DocNormalizeJobData, DocNormalizeResult } from '../lib/queues';
import { enqueueDocOcr } from '../lib/queues';

/**
 * DOC_NORMALIZE handler
 *
 * Pipeline step 1: Normalize document for processing
 * - For PDFs: Extract page images or validate structure
 * - For images: Validate format and dimensions
 * - Count pages
 * - Create normalized blob(s)
 * - Enqueue OCR jobs for each page
 */
export async function handleDocNormalize(
  job: Job<DocNormalizeJobData>
): Promise<DocNormalizeResult> {
  const { documentId, workspaceId } = job.data;

  console.log(`[DOC_NORMALIZE] Processing document ${documentId}`);

  try {
    // Update status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.processing },
    });

    await job.updateProgress(10);

    // Get document with blobs
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        blobs: {
          where: { blobType: 'original' },
        },
      },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const originalBlob = document.blobs[0];
    if (!originalBlob) {
      throw new Error(`No original blob found for document: ${documentId}`);
    }

    await job.updateProgress(30);

    // TODO: Implement actual normalization in T10
    // - Download file from storage
    // - Process based on mimeType
    // - For PDF: use pdf-lib or similar to count pages
    // - For images: validate format, get dimensions
    // - Create normalized versions if needed
    // - Upload normalized blobs

    // For now, simulate processing
    const pageCount = document.mimeType === 'application/pdf' ? 1 : 1;

    // Update document with page count
    await prisma.document.update({
      where: { id: documentId },
      data: { pageCount },
    });

    await job.updateProgress(70);

    // Enqueue OCR jobs for each page
    for (let page = 1; page <= pageCount; page++) {
      await enqueueDocOcr({
        documentId,
        workspaceId,
        pageNumber: page,
        storagePath: originalBlob.storagePath,
      });
    }

    await job.updateProgress(100);

    console.log(`[DOC_NORMALIZE] Document ${documentId} normalized, ${pageCount} pages`);

    return {
      success: true,
      documentId,
      pageCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DOC_NORMALIZE] Failed for ${documentId}:`, errorMessage);

    // Mark document as failed
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.failed,
        failReason: `Normalization failed: ${errorMessage}`,
      },
    });

    return {
      success: false,
      documentId,
      error: errorMessage,
    };
  }
}
