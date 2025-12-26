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
 * - Look up or create merchant
 * - Create invoice record (as proposal, not approved)
 * - Create line items if present
 * - Mark document as ready for review
 */
export async function handleDocPostprocess(
  job: Job<DocPostprocessJobData>
): Promise<DocPostprocessResult> {
  const { documentId, workspaceId, extractionId } = job.data;

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

    // Parse extraction payload
    const payload = extraction.payloadJson as ExtractionPayload;
    const docKind = payload.kind || document.docType || 'other';

    await job.updateProgress(30);

    let invoiceId: string | undefined;

    // Process based on document type
    if (docKind === 'invoice' && isInvoicePayload(payload)) {
      invoiceId = await processInvoice(workspaceId, documentId, payload);
      console.log(`[DOC_POSTPROCESS] Created invoice ${invoiceId}`);
    } else if (docKind === 'receipt' && isReceiptPayload(payload)) {
      invoiceId = await processReceipt(workspaceId, documentId, payload);
      console.log(`[DOC_POSTPROCESS] Created receipt invoice ${invoiceId}`);
    } else if (docKind === 'statement' || docKind === 'bank_statement') {
      // Statements don't create invoices - they may trigger bank tx imports
      // This will be handled by a separate CSV import flow in T17
      console.log(`[DOC_POSTPROCESS] Statement detected, no invoice created`);
    } else {
      // Unknown type - still mark as ready for manual review
      console.log(`[DOC_POSTPROCESS] Unknown type: ${docKind}, skipping invoice creation`);
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
      invoiceId,
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

/**
 * Type guards for payload types
 */
function isInvoicePayload(payload: ExtractionPayload): payload is InvoicePayload {
  return payload.kind === 'invoice';
}

function isReceiptPayload(payload: ExtractionPayload): payload is ReceiptPayload {
  return payload.kind === 'receipt';
}

/**
 * Normalize merchant name for matching
 */
function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    .trim();
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;

  // Try ISO format first
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try common formats
  const formats = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
    /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      const [, day, month, year] = match;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }

  return null;
}

/**
 * Find or create merchant from vendor name
 */
async function findOrCreateMerchant(
  workspaceId: string,
  vendorName: string,
  vatNumber?: string,
  _address?: string
): Promise<string> {
  const normalizedName = normalizeMerchantName(vendorName);

  // Try to find existing merchant
  const existing = await prisma.merchant.findFirst({
    where: {
      workspaceId,
      normalizedName,
    },
  });

  if (existing) {
    return existing.id;
  }

  // Extract country from address or VAT number if possible
  let country: string | undefined;
  if (vatNumber && vatNumber.length >= 2) {
    const countryPrefix = vatNumber.substring(0, 2).toUpperCase();
    if (/^[A-Z]{2}$/.test(countryPrefix)) {
      country = countryPrefix;
    }
  }

  // Create new merchant
  const merchant = await prisma.merchant.create({
    data: {
      workspaceId,
      name: vendorName,
      normalizedName,
      vatNumber: vatNumber || null,
      country: country || null,
    },
  });

  return merchant.id;
}

/**
 * Process invoice extraction
 */
async function processInvoice(
  workspaceId: string,
  documentId: string,
  payload: InvoicePayload
): Promise<string> {
  // Find or create merchant
  let merchantId: string | undefined;
  if (payload.vendorName) {
    merchantId = await findOrCreateMerchant(
      workspaceId,
      payload.vendorName,
      payload.vendorVatId,
      payload.vendorAddress
    );
  }

  // Parse dates
  const issueDate = parseDate(payload.issueDate);
  const dueDate = parseDate(payload.dueDate);

  // Create invoice (as proposal - status 'pending')
  const invoice = await prisma.invoice.create({
    data: {
      workspaceId,
      documentId,
      merchantId: merchantId || null,
      invoiceNumber: payload.invoiceNumber || null,
      issueDate: issueDate,
      dueDate: dueDate,
      currency: payload.currency || 'EUR',
      subtotal: payload.subtotal || 0,
      vatAmount: payload.vatTotal || 0,
      total: payload.total || 0,
      status: 'pending', // Not approved - requires review
    },
  });

  // Create line items if present
  if (payload.lineItems && payload.lineItems.length > 0) {
    await prisma.invoiceLineItem.createMany({
      data: payload.lineItems.map((item, index) => ({
        invoiceId: invoice.id,
        description: item.description || null,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        amount: item.lineTotal || 0,
        vatRate: item.vatRate || null,
        sortOrder: index,
      })),
    });
  }

  return invoice.id;
}

/**
 * Process receipt extraction (similar to invoice but uses receipt fields)
 */
async function processReceipt(
  workspaceId: string,
  documentId: string,
  payload: ReceiptPayload
): Promise<string> {
  // Find or create merchant
  let merchantId: string | undefined;
  if (payload.merchantName) {
    merchantId = await findOrCreateMerchant(
      workspaceId,
      payload.merchantName,
      undefined,
      payload.merchantAddress
    );
  }

  // Parse date
  const receiptDate = parseDate(payload.date);

  // Create invoice record (receipts are stored as invoices)
  const invoice = await prisma.invoice.create({
    data: {
      workspaceId,
      documentId,
      merchantId: merchantId || null,
      invoiceNumber: null, // Receipts typically don't have invoice numbers
      issueDate: receiptDate,
      dueDate: null, // Receipts are typically paid immediately
      currency: payload.currency || 'EUR',
      subtotal: payload.subtotal || 0,
      vatAmount: payload.vatTotal || 0,
      total: payload.total || 0,
      status: 'pending',
    },
  });

  // Create line items if present
  if (payload.items && payload.items.length > 0) {
    await prisma.invoiceLineItem.createMany({
      data: payload.items.map((item, index) => ({
        invoiceId: invoice.id,
        description: item.description || null,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        amount: item.total || 0,
        vatRate: null, // Receipts often don't show per-item VAT
        sortOrder: index,
      })),
    });
  }

  return invoice.id;
}
