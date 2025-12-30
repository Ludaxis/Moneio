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
 *
 * Patterns are scored, and some patterns are "strong" indicators that
 * should heavily influence the decision.
 */

// Strong indicators that definitively identify document type
const STRONG_INVOICE_PATTERNS = [
  /\binvoice\b/i, // Word "invoice" on its own
  /\binvoice\s*[-#:]\s*\w+/i, // "Invoice #123" or "Invoice: ABC"
  /tax\s+invoice/i,
  /proforma\s+invoice/i,
  /invoice\s+number/i,
  /invoice\s+date/i,
];

const INVOICE_PATTERNS = [
  /bill\s*(?:ed\s+)?to/i,
  /due\s+date/i,
  /payment\s+terms/i,
  /amount\s+due/i,
  /vat|value\s+added\s+tax/i,
  /billing\s+address/i,
  /line\s+items?/i,
  /unit\s+price/i,
  /quantity/i,
  /tax\s+rate/i,
  /from\s*:/i, // "From:" section common in invoices
  /issued\s+on/i,
  /registration\s+number/i,
];

const STRONG_RECEIPT_PATTERNS = [/\breceipt\b/i, /sales\s+receipt/i, /payment\s+receipt/i];

const RECEIPT_PATTERNS = [
  /cash|credit\s+card/i,
  /change\s+due/i,
  /thank\s+you\s+for\s+your\s+purchase/i,
  /subtotal/i,
  /total\s*:/i,
  /payment\s+received/i,
  /paid\s+in\s+full/i,
  /cashier/i,
  /transaction\s+id/i,
];

const STRONG_STATEMENT_PATTERNS = [
  /bank\s+statement/i,
  /account\s+statement/i,
  /statement\s+of\s+account/i,
  /statement\s+period/i,
];

const STATEMENT_PATTERNS = [
  /opening\s+balance/i,
  /closing\s+balance/i,
  /transaction\s+history/i,
  /current\s+balance/i,
  /available\s+balance/i,
  /previous\s+balance/i,
  /statement\s+date/i,
];

// Note: IBAN/BIC removed from statement patterns because invoices
// often include bank details for payment purposes

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

  // Strong patterns are worth 3 points each (they're definitive indicators)
  // Regular patterns are worth 1 point each
  const STRONG_WEIGHT = 3;

  // Calculate scores with weighted strong patterns
  const strongInvoiceMatches = STRONG_INVOICE_PATTERNS.filter((p) => p.test(fullText)).length;
  const regularInvoiceMatches = INVOICE_PATTERNS.filter((p) => p.test(fullText)).length;
  const invoiceScore = strongInvoiceMatches * STRONG_WEIGHT + regularInvoiceMatches;

  const strongReceiptMatches = STRONG_RECEIPT_PATTERNS.filter((p) => p.test(fullText)).length;
  const regularReceiptMatches = RECEIPT_PATTERNS.filter((p) => p.test(fullText)).length;
  const receiptScore = strongReceiptMatches * STRONG_WEIGHT + regularReceiptMatches;

  const strongStatementMatches = STRONG_STATEMENT_PATTERNS.filter((p) => p.test(fullText)).length;
  const regularStatementMatches = STATEMENT_PATTERNS.filter((p) => p.test(fullText)).length;
  const statementScore = strongStatementMatches * STRONG_WEIGHT + regularStatementMatches;

  const maxScore = Math.max(invoiceScore, receiptScore, statementScore);

  // Calculate confidence based on how many patterns matched
  // Max possible: 6 strong patterns * 3 + 13 regular patterns = 31 for invoice
  const maxPossible = 30;
  const confidence = maxScore > 0 ? Math.min(Math.round((maxScore / maxPossible) * 100), 100) : 0;

  // Determine type based on highest score
  let type: DetectedDocumentType;

  // If we have strong matches for a type, that type wins (unless another has more strong matches)
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

  // Log detection results for debugging
  console.log(
    `[DOC_TYPE] Detection: invoice=${invoiceScore} (${strongInvoiceMatches} strong), ` +
      `receipt=${receiptScore} (${strongReceiptMatches} strong), ` +
      `statement=${statementScore} (${strongStatementMatches} strong) → ${type}`
  );

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
