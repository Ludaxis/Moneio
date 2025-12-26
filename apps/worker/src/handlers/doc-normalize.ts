import { Job } from 'bullmq';
import { prisma, DocumentStatus } from '@moneio/db';

import type { DocNormalizeJobData, DocNormalizeResult } from '../lib/queues';
import { enqueueDocOcr } from '../lib/queues';
import { downloadFile, uploadFile } from '../lib/storage';
import { getDocumentInfo, extractPdfPages, normalizeImage } from '../lib/document-processor';

/**
 * DOC_NORMALIZE handler
 *
 * Pipeline step 1: Normalize document for processing
 * - Download original file from storage
 * - For PDFs: Count pages, extract each page as separate PDF
 * - For images: Validate format, normalize if needed
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

    await job.updateProgress(20);

    // Download the file
    console.log(`[DOC_NORMALIZE] Downloading file: ${originalBlob.storagePath}`);
    const fileData = await downloadFile(originalBlob.storagePath);

    await job.updateProgress(40);

    // Get document info (page count, dimensions)
    const docInfo = await getDocumentInfo(fileData, document.mimeType);
    console.log(`[DOC_NORMALIZE] Document info:`, docInfo);

    await job.updateProgress(50);

    // Update document with page count
    await prisma.document.update({
      where: { id: documentId },
      data: { pageCount: docInfo.pageCount },
    });

    // Process based on document type
    const isPdf = document.mimeType === 'application/pdf';

    if (isPdf && docInfo.pageCount > 1) {
      // Multi-page PDF: Extract each page
      console.log(`[DOC_NORMALIZE] Extracting ${docInfo.pageCount} pages from PDF`);
      const pages = await extractPdfPages(fileData);

      await job.updateProgress(70);

      // Upload each page and create blobs
      for (const page of pages) {
        const pagePath = `${workspaceId}/${documentId}/page-${page.pageNumber}.pdf`;

        await uploadFile(pagePath, page.data, page.mimeType);

        // Create blob record for this page
        await prisma.documentBlob.create({
          data: {
            documentId,
            storagePath: pagePath,
            blobType: `page-${page.pageNumber}`,
          },
        });

        // Enqueue OCR for this page
        await enqueueDocOcr({
          documentId,
          workspaceId,
          pageNumber: page.pageNumber,
          storagePath: pagePath,
        });
      }
    } else if (isPdf) {
      // Single page PDF: Use original file
      console.log(`[DOC_NORMALIZE] Single page PDF, using original`);

      await job.updateProgress(70);

      await enqueueDocOcr({
        documentId,
        workspaceId,
        pageNumber: 1,
        storagePath: originalBlob.storagePath,
      });
    } else {
      // Image: Normalize if needed
      console.log(`[DOC_NORMALIZE] Processing image`);
      const normalized = await normalizeImage(fileData, document.mimeType);

      await job.updateProgress(70);

      // If normalized data is different, upload it
      if (normalized.data !== fileData) {
        const normalizedPath = `${workspaceId}/${documentId}/normalized.${getExtension(normalized.mimeType)}`;
        await uploadFile(normalizedPath, normalized.data, normalized.mimeType);

        await prisma.documentBlob.create({
          data: {
            documentId,
            storagePath: normalizedPath,
            blobType: 'normalized',
          },
        });

        await enqueueDocOcr({
          documentId,
          workspaceId,
          pageNumber: 1,
          storagePath: normalizedPath,
        });
      } else {
        // Use original
        await enqueueDocOcr({
          documentId,
          workspaceId,
          pageNumber: 1,
          storagePath: originalBlob.storagePath,
        });
      }
    }

    await job.updateProgress(100);

    console.log(`[DOC_NORMALIZE] Document ${documentId} normalized, ${docInfo.pageCount} pages`);

    return {
      success: true,
      documentId,
      pageCount: docInfo.pageCount,
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

/**
 * Get file extension from MIME type
 */
function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
  };
  return map[mimeType] || 'bin';
}
