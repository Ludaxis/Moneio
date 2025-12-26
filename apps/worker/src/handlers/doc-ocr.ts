import { Job } from 'bullmq';
import { prisma, DocumentStatus } from '@moneio/db';

import type { DocOcrJobData, DocOcrResult } from '../lib/queues';
import { enqueueDocExtract } from '../lib/queues';

/**
 * DOC_OCR handler
 *
 * Pipeline step 2: OCR each page using Google Vision
 * - Download page image from storage
 * - Send to Google Vision API
 * - Store OCR result in ocr_artifacts table
 * - When all pages are done, enqueue extraction
 */
export async function handleDocOcr(
  job: Job<DocOcrJobData>
): Promise<DocOcrResult> {
  const { documentId, workspaceId, pageNumber, storagePath } = job.data;

  console.log(`[DOC_OCR] Processing page ${pageNumber} of document ${documentId}`);

  try {
    await job.updateProgress(10);

    // TODO: Implement actual OCR in T11
    // - Download image from Supabase storage
    // - Call Google Vision API
    // - Parse response

    // For now, create a stub OCR artifact
    const ocrArtifact = await prisma.ocrArtifact.upsert({
      where: {
        documentId_pageNumber: {
          documentId,
          pageNumber,
        },
      },
      update: {
        payloadJson: {
          text: 'OCR text will be extracted here',
          blocks: [],
          confidence: 0,
          _stub: true,
        },
      },
      create: {
        documentId,
        pageNumber,
        payloadJson: {
          text: 'OCR text will be extracted here',
          blocks: [],
          confidence: 0,
          _stub: true,
        },
      },
    });

    await job.updateProgress(80);

    // Check if all pages are OCR'd
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { pageCount: true },
    });

    const ocrCount = await prisma.ocrArtifact.count({
      where: { documentId },
    });

    if (document?.pageCount && ocrCount >= document.pageCount) {
      // Update document status
      await prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.ocr_complete },
      });

      // Enqueue extraction
      await enqueueDocExtract({
        documentId,
        workspaceId,
      });
    }

    await job.updateProgress(100);

    console.log(`[DOC_OCR] Page ${pageNumber} of ${documentId} completed`);

    return {
      success: true,
      documentId,
      pageNumber,
      ocrArtifactId: ocrArtifact.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DOC_OCR] Failed for ${documentId} page ${pageNumber}:`, errorMessage);

    return {
      success: false,
      documentId,
      pageNumber,
      error: errorMessage,
    };
  }
}
