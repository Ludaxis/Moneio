// Base extractor interface
import type { OcrPayload } from '@moneio/core-ledger';
import type {
  ExtractionPayload,
  InvoiceExtraction,
  ReceiptExtraction,
  StatementExtraction,
} from '@moneio/domain';

import type { AiProposal, WorkspaceContext } from '../types.js';

export interface ExtractionInput {
  ocrPayload: OcrPayload;
  documentType?: 'invoice' | 'statement' | 'receipt';
  context: WorkspaceContext;
}

export interface Extractor {
  extract(input: ExtractionInput): Promise<AiProposal<ExtractionPayload>>;
}

export interface InvoiceExtractorAdapter {
  extractInvoice(
    ocrPayload: OcrPayload,
    context: WorkspaceContext
  ): Promise<AiProposal<InvoiceExtraction>>;
}

export interface StatementExtractorAdapter {
  extractStatement(
    ocrPayload: OcrPayload,
    context: WorkspaceContext
  ): Promise<AiProposal<StatementExtraction>>;
}

export interface ReceiptExtractorAdapter {
  extractReceipt(
    ocrPayload: OcrPayload,
    context: WorkspaceContext
  ): Promise<AiProposal<ReceiptExtraction>>;
}

export interface DocumentTypeDetector {
  detectType(ocrPayload: OcrPayload): Promise<{
    type: 'invoice' | 'statement' | 'receipt' | 'other';
    confidence: number;
  }>;
}

export class UnifiedExtractor implements Extractor {
  constructor(
    private readonly invoiceExtractor: InvoiceExtractorAdapter,
    private readonly statementExtractor: StatementExtractorAdapter,
    private readonly receiptExtractor: ReceiptExtractorAdapter,
    private readonly typeDetector: DocumentTypeDetector
  ) {}

  async extract(input: ExtractionInput): Promise<AiProposal<ExtractionPayload>> {
    // Detect document type if not provided
    let documentType = input.documentType;
    if (!documentType) {
      const detection = await this.typeDetector.detectType(input.ocrPayload);
      documentType = detection.type === 'other' ? 'invoice' : detection.type;
    }

    // Extract based on type
    switch (documentType) {
      case 'invoice':
        return this.invoiceExtractor.extractInvoice(input.ocrPayload, input.context);
      case 'statement':
        return this.statementExtractor.extractStatement(input.ocrPayload, input.context);
      case 'receipt':
        return this.receiptExtractor.extractReceipt(input.ocrPayload, input.context);
      default:
        // Default to invoice extraction
        return this.invoiceExtractor.extractInvoice(input.ocrPayload, input.context);
    }
  }
}
