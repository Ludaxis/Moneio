import { prisma, DocumentStatus } from '@moneio/db';
import { Job } from 'bullmq';

import { performOcrWithRetry } from '../lib/ocr';
import type { DocOcrJobData, DocOcrResult } from '../lib/queues';
import { enqueueDocExtract } from '../lib/queues';
import { downloadFile } from '../lib/storage';

/**
 * DOC_OCR handler
 *
 * Pipeline step 2: OCR each page using Google Vision
 * - Download page file from storage
 * - Send to Google Vision API
 * - Store OCR result in ocr_artifacts table
 * - When all pages are done, enqueue extraction
 */
export async function handleDocOcr(job: Job<DocOcrJobData>): Promise<DocOcrResult> {
  const { documentId, workspaceId, pageNumber, storagePath } = job.data;

  console.log(`[DOC_OCR] Processing page ${pageNumber} of document ${documentId}`);

  try {
    await job.updateProgress(10);

    // Get document to check pageCount and fallback mimeType
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { mimeType: true, pageCount: true },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Download the file
    console.log(`[DOC_OCR] Downloading: ${storagePath}`);
    const fileData = await downloadFile(storagePath);

    await job.updateProgress(30);

    // Perform OCR
    const ocrResult = await performOcrWithRetry(fileData, job.data.mimeType || document.mimeType);

    // Fail if OCR returns empty text - don't silently continue
    if (!ocrResult.fullText || ocrResult.fullText.trim().length === 0) {
      throw new Error('OCR returned no text - document may be unreadable or corrupted');
    }

    console.log(`[DOC_OCR] Extracted ${ocrResult.fullText.length} chars from page ${pageNumber}`);

    await job.updateProgress(70);

    // Store OCR artifact
    const ocrArtifact = await prisma.ocrArtifact.upsert({
      where: {
        documentId_pageNumber: {
          documentId,
          pageNumber,
        },
      },
      update: {
        payloadJson: {
          text: ocrResult.fullText,
          blocks: JSON.parse(JSON.stringify(ocrResult.blocks)),
          confidence: ocrResult.confidence,
          language: ocrResult.language,
        },
      },
      create: {
        documentId,
        pageNumber,
        payloadJson: {
          text: ocrResult.fullText,
          blocks: JSON.parse(JSON.stringify(ocrResult.blocks)),
          confidence: ocrResult.confidence,
          language: ocrResult.language,
        },
      },
    });

    await job.updateProgress(90);

    // Check if all pages are OCR'd
    const ocrCount = await prisma.ocrArtifact.count({
      where: { documentId },
    });

    console.log(
      `[DOC_OCR] Page ${pageNumber} done. ${ocrCount}/${document.pageCount} pages complete.`
    );

    if (document.pageCount && ocrCount >= document.pageCount) {
      // All pages done - update status and enqueue extraction
      await prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.ocr_complete },
      });

      await enqueueDocExtract({
        documentId,
        workspaceId,
      });

      console.log(`[DOC_OCR] All pages complete for ${documentId}, enqueued extraction`);
    }

    await job.updateProgress(100);

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
