import { prisma, DocumentStatus } from '@moneio/db';
import { Job } from 'bullmq';

import type { DocPostprocessJobData, DocPostprocessResult } from '../lib/queues';

/**
 * Extraction payload types (from LLM output)
 */
interface InvoicePayload {
  kind: 'invoice';
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorVatId?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerVatId?: string;
  currency?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    vatRate?: number;
    lineTotal?: number;
  }>;
}

interface ReceiptPayload {
  kind: 'receipt';
  merchantName?: string;
  merchantAddress?: string;
  date?: string;
  currency?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  paymentMethod?: string;
  items?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    total?: number;
  }>;
}

interface StatementPayload {
  kind: 'statement';
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  iban?: string;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  transactions?: Array<{
    date?: string;
    description?: string;
    amount?: number;
    balance?: number;
    reference?: string;
  }>;
}

type ExtractionPayload = InvoicePayload | ReceiptPayload | StatementPayload | { kind?: string };

/**
 * DOC_POSTPROCESS handler
 *
 * Pipeline step 4: Postprocess extraction
 * - Parse extraction payload based on document type
 * - Mark document as ready for review
 *
 * NOTE: Invoice creation happens when user approves extraction via
 * /api/documents/[id]/extraction/approve - NOT automatically here.
 * This ensures human review before creating financial records.
 */
export async function handleDocPostprocess(
  job: Job<DocPostprocessJobData>
): Promise<DocPostprocessResult> {
  const { documentId, extractionId } = job.data;

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

    await job.updateProgress(20);

    // Get document for type info
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Parse extraction payload to log document type
    const payload = extraction.payloadJson as ExtractionPayload;
    const docKind = payload.kind || document.docType || 'other';

    await job.updateProgress(30);

    // Log document type - invoice creation deferred until user approval
    if (docKind === 'invoice' || docKind === 'receipt') {
      console.log(
        `[DOC_POSTPROCESS] ${docKind} extraction ready for review (document ${documentId})`
      );
    } else if (docKind === 'statement' || docKind === 'bank_statement') {
      console.log(`[DOC_POSTPROCESS] Statement detected (document ${documentId})`);
    } else {
      console.log(`[DOC_POSTPROCESS] Document type: ${docKind} (document ${documentId})`);
    }

    await job.updateProgress(80);

    // Mark document as ready for review
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
