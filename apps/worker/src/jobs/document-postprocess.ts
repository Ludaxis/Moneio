import type { Job } from 'bullmq';
import type { InvoiceExtraction } from '../services/openai.js';

export interface DocumentPostprocessJob {
  documentId: string;
  workspaceId: string;
  documentType: 'invoice' | 'receipt' | 'statement' | 'other';
  extraction: InvoiceExtraction;
  confidence: number;
}

export interface DocumentPostprocessResult {
  documentId: string;
  invoiceId?: string;
  merchantId?: string;
  matchedTransactionId?: string;
  categorySuggestions: Array<{
    transactionId: string;
    categoryId: string;
    confidence: number;
  }>;
}

export async function processDocumentPostprocess(
  job: Job<DocumentPostprocessJob>
): Promise<DocumentPostprocessResult> {
  const { documentId, workspaceId, documentType, extraction, confidence } = job.data;

  console.log(`[DOC_POSTPROCESS] Postprocessing document ${documentId}`);

  await job.updateProgress(10);

  // 1. Normalize merchant name
  let merchantId: string | undefined;
  if (extraction.vendorName) {
    const normalizedName = normalizeMerchantName(extraction.vendorName);
    // TODO: Look up or create merchant in database
    // merchantId = await upsertMerchant(workspaceId, normalizedName, extraction.vendorVatId);
  }

  await job.updateProgress(30);

  // 2. Normalize dates
  const issueDate = extraction.issueDate ? normalizeDate(extraction.issueDate) : null;
  const dueDate = extraction.dueDate ? normalizeDate(extraction.dueDate) : null;

  // 3. Calculate VAT if not provided
  let vatTotal = extraction.vatTotal;
  if (!vatTotal && extraction.subtotal && extraction.total) {
    vatTotal = extraction.total - extraction.subtotal;
  }

  await job.updateProgress(50);

  // 4. Create invoice record if it's an invoice/receipt
  let invoiceId: string | undefined;
  if (documentType === 'invoice' || documentType === 'receipt') {
    // TODO: Create invoice in database
    // invoiceId = await createInvoice(workspaceId, documentId, merchantId, extraction);
  }

  await job.updateProgress(70);

  // 5. Attempt to match with existing transactions
  let matchedTransactionId: string | undefined;
  if (extraction.total) {
    // TODO: Look for matching transaction
    // matchedTransactionId = await findMatchingTransaction(workspaceId, extraction.total, issueDate);
  }

  await job.updateProgress(90);

  // 6. Create categorization suggestions
  const categorySuggestions: DocumentPostprocessResult['categorySuggestions'] = [];

  await job.updateProgress(100);

  console.log(
    `[DOC_POSTPROCESS] Postprocessing complete for document ${documentId}` +
      (invoiceId ? `, created invoice ${invoiceId}` : '') +
      (matchedTransactionId ? `, matched transaction ${matchedTransactionId}` : '')
  );

  return {
    documentId,
    invoiceId,
    merchantId,
    matchedTransactionId,
    categorySuggestions,
  };
}

function normalizeMerchantName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .toUpperCase();
}

function normalizeDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}
