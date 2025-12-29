/**
 * Document Type Detection
 *
 * Analyzes OCR text content to determine the document type.
 * This is domain logic that can be reused across workers and API routes.
 */

import type { OcrPayload } from '@moneio/core-ledger';

/**
 * Supported document types for detection
 * Note: Named DetectedDocumentType to avoid conflict with schemas/documents.ts DocumentType
 */
export type DetectedDocumentType = 'invoice' | 'receipt' | 'bank_statement' | 'other';

/**
 * Document detection result with confidence scores
 */
export interface DocumentTypeResult {
  type: DetectedDocumentType;
  confidence: number;
  scores: {
    invoice: number;
    receipt: number;
    statement: number;
  };
}

/**
 * Pattern definitions for document type detection
 */
const INVOICE_PATTERNS = [
  /invoice/i,
  /bill\s+to/i,
  /due\s+date/i,
  /invoice\s+number/i,
  /payment\s+terms/i,
  /amount\s+due/i,
  /vat|value\s+added\s+tax/i,
  /tax\s+invoice/i,
  /proforma/i,
  /billing\s+address/i,
];

const RECEIPT_PATTERNS = [
  /receipt/i,
  /cash|credit\s+card/i,
  /change\s+due/i,
  /thank\s+you\s+for\s+your\s+purchase/i,
  /subtotal/i,
  /total\s*:/i,
  /payment\s+received/i,
  /paid\s+in\s+full/i,
  /cashier/i,
];

const STATEMENT_PATTERNS = [
  /statement/i,
  /account\s+number/i,
  /opening\s+balance/i,
  /closing\s+balance/i,
  /transaction\s+history/i,
  /iban/i,
  /bic|swift/i,
  /account\s+statement/i,
  /bank\s+statement/i,
  /current\s+balance/i,
];

/**
 * Detect document type from OCR payload
 *
 * @param payload - OCR payload containing page text
 * @returns Document type detection result
 */
export function detectDocumentType(payload: OcrPayload): DocumentTypeResult {
  const fullText = payload.pages
    .map((p) => p.text)
    .join(' ')
    .toLowerCase();

  return detectDocumentTypeFromText(fullText);
}

/**
 * Detect document type from plain text
 *
 * @param text - Full text content to analyze
 * @returns Document type detection result
 */
export function detectDocumentTypeFromText(text: string): DocumentTypeResult {
  const fullText = text.toLowerCase();

  // Count matches for each type
  const invoiceScore = INVOICE_PATTERNS.filter((p) => p.test(fullText)).length;
  const receiptScore = RECEIPT_PATTERNS.filter((p) => p.test(fullText)).length;
  const statementScore = STATEMENT_PATTERNS.filter((p) => p.test(fullText)).length;

  const maxScore = Math.max(invoiceScore, receiptScore, statementScore);

  // Calculate confidence as percentage of patterns matched relative to max possible
  const confidence = maxScore > 0 ? Math.round((maxScore / Math.max(...[10, 9, 10])) * 100) : 0;

  // Determine type based on highest score
  let type: DetectedDocumentType;

  if (invoiceScore >= receiptScore && invoiceScore >= statementScore && invoiceScore > 0) {
    type = 'invoice';
  } else if (receiptScore > invoiceScore && receiptScore >= statementScore && receiptScore > 0) {
    type = 'receipt';
  } else if (statementScore > invoiceScore && statementScore > receiptScore && statementScore > 0) {
    type = 'bank_statement';
  } else {
    // Default to 'other' if no clear match
    type = 'other';
  }

  return {
    type,
    confidence,
    scores: {
      invoice: invoiceScore,
      receipt: receiptScore,
      statement: statementScore,
    },
  };
}

/**
 * Simple document type detection (returns type string only)
 *
 * @param payload - OCR payload containing page text
 * @returns Document type string
 */
export function getDocumentType(payload: OcrPayload): DetectedDocumentType {
  return detectDocumentType(payload).type;
}

/**
 * Simple document type detection from text (returns type string only)
 *
 * @param text - Full text content to analyze
 * @returns Document type string
 */
export function getDocumentTypeFromText(text: string): DetectedDocumentType {
  return detectDocumentTypeFromText(text).type;
}
