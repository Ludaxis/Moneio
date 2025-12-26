import { Job } from 'bullmq';
import { prisma, DocumentStatus } from '@moneio/db';

import type { DocExtractJobData, DocExtractResult } from '../lib/queues';
import { enqueueDocPostprocess } from '../lib/queues';

/**
 * DOC_EXTRACT handler
 *
 * Pipeline step 3: Extract structured data using LLM
 * - Gather all OCR artifacts for the document
 * - Send to OpenAI for structured extraction
 * - Validate output with Zod schema
 * - Store extraction in extractions table
 * - Enqueue postprocessing
 */
export async function handleDocExtract(
  job: Job<DocExtractJobData>
): Promise<DocExtractResult> {
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

    await job.updateProgress(30);

    // TODO: Implement actual extraction in T13
    // - Combine OCR text from all pages
    // - Call OpenAI with structured output schema
    // - Validate with Zod
    // - Handle repair if validation fails

    // Get current version number
    const latestExtraction = await prisma.extraction.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = (latestExtraction?.version || 0) + 1;

    // Create stub extraction
    const extraction = await prisma.extraction.create({
      data: {
        documentId,
        version: nextVersion,
        payloadJson: {
          type: 'invoice',
          vendorName: 'Pending extraction',
          invoiceNumber: '',
          invoiceDate: null,
          dueDate: null,
          currency: 'EUR',
          subtotal: 0,
          vatAmount: 0,
          total: 0,
          lineItems: [],
          _stub: true,
        },
        approved: false,
      },
    });

    await job.updateProgress(80);

    // Enqueue postprocessing
    await enqueueDocPostprocess({
      documentId,
      workspaceId,
      extractionId: extraction.id,
    });

    await job.updateProgress(100);

    console.log(`[DOC_EXTRACT] Document ${documentId} extraction v${nextVersion} created`);

    return {
      success: true,
      documentId,
      extractionId: extraction.id,
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
