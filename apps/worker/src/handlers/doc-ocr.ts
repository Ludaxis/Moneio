import { prisma, DocumentStatus } from '@moneio/db';
import { Job } from 'bullmq';

import { performOcrWithRetry, type OcrResult } from '../lib/ocr';
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
export async function handleDocOcr(
  job: Job<DocOcrJobData>
): Promise<DocOcrResult> {
  const { documentId, workspaceId, pageNumber, storagePath } = job.data;

  console.log(`[DOC_OCR] Processing page ${pageNumber} of document ${documentId}`);

  try {
    await job.updateProgress(10);

    // Get document to check mimeType
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
    let ocrResult: OcrResult;
    try {
      ocrResult = await performOcrWithRetry(fileData, document.mimeType);
    } catch (error) {
      // If OCR fails, create a stub result instead of failing completely
      console.warn(`[DOC_OCR] OCR failed, using empty result:`, error);
      ocrResult = {
        fullText: '',
        blocks: [],
        confidence: 0,
        language: null,
      };
    }

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

    console.log(`[DOC_OCR] Page ${pageNumber} done. ${ocrCount}/${document.pageCount} pages complete.`);

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
