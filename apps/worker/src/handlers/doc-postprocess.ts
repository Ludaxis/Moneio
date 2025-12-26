import { prisma, DocumentStatus } from '@moneio/db';
import { Job } from 'bullmq';

import type { DocPostprocessJobData, DocPostprocessResult } from '../lib/queues';

/**
 * DOC_POSTPROCESS handler
 *
 * Pipeline step 4: Postprocess extraction
 * - Determine document type (invoice, receipt, etc.)
 * - Look up or create merchant
 * - Create invoice record (as proposal, not approved)
 * - Mark document as ready for review
 */
export async function handleDocPostprocess(
  job: Job<DocPostprocessJobData>
): Promise<DocPostprocessResult> {
  const { documentId, workspaceId: _workspaceId, extractionId } = job.data;

  console.log(`[DOC_POSTPROCESS] Processing document ${documentId}`);

  try {
    await job.updateProgress(10);

    // Get extraction
    const extraction = await prisma.extraction.findUnique({
      where: { id: extractionId },
    });

    if (!extraction) {
      throw new Error(`Extraction not found: ${extractionId}`);
    }

    await job.updateProgress(30);

    // TODO: Implement actual postprocessing in T14
    // - Parse extraction payload
    // - Match or create merchant
    // - Create invoice record
    // - Link to document

    const payload = extraction.payloadJson as Record<string, unknown>;
    const docType = (payload.type as string) || 'invoice';

    // Update document type
    await prisma.document.update({
      where: { id: documentId },
      data: {
        docType: docType as 'invoice' | 'receipt' | 'bank_statement' | 'other',
      },
    });

    await job.updateProgress(70);

    // Mark document as ready
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.ready },
    });

    await job.updateProgress(100);

    console.log(`[DOC_POSTPROCESS] Document ${documentId} ready for review`);

    return {
      success: true,
      documentId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DOC_POSTPROCESS] Failed for ${documentId}:`, errorMessage);

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.failed,
        failReason: `Postprocessing failed: ${errorMessage}`,
      },
    });

    return {
      success: false,
      documentId,
      error: errorMessage,
    };
  }
}
