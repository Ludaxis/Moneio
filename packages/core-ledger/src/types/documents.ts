// Document types

import type { EntityBase, UUID } from './common';

export type DocumentType = 'invoice' | 'statement' | 'receipt' | 'other';

export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export type DocumentSource = 'upload' | 'email' | 'mobile';

export interface Document extends EntityBase {
  type: DocumentType;
  status: DocumentStatus;
  fileName: string;
  mimeType: string;
  pageCount: number;
  source: DocumentSource;
  createdByUserId: UUID;
}

export interface DocumentBlob {
  documentId: UUID;
  storageProvider: 'local' | 's3' | 'gcs' | 'azure';
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface OcrArtifact {
  documentId: UUID;
  version: number;
  payloadJson: OcrPayload;
  createdAt: string;
}

export interface OcrPayload {
  pages: OcrPage[];
  metadata?: Record<string, unknown>;
}

export interface OcrPage {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  blocks: OcrBlock[];
  tables?: OcrTable[];
}

export interface OcrBlock {
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  type: 'text' | 'heading' | 'list_item' | 'table_cell';
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrTable {
  rows: OcrTableRow[];
  boundingBox: BoundingBox;
}

export interface OcrTableRow {
  cells: OcrTableCell[];
}

export interface OcrTableCell {
  text: string;
  rowSpan: number;
  colSpan: number;
  boundingBox: BoundingBox;
}

// Extraction types
export type ExtractionKind = 'invoice' | 'statement' | 'receipt';

export type ExtractionCreator = 'ai' | 'user';

export interface Extraction extends EntityBase {
  documentId: UUID;
  version: number;
  kind: ExtractionKind;
  payloadJson: ExtractionPayload;
  confidenceScore: number;
  createdBy: ExtractionCreator;
  modelInfo?: string;
}

export type ExtractionPayload = InvoiceExtraction | StatementExtraction | ReceiptExtraction;

export interface InvoiceExtraction {
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
  lineItems?: InvoiceLineItemExtraction[];
}

export interface InvoiceLineItemExtraction {
  description: string;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
  lineTotal?: number;
}

export interface StatementExtraction {
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
  transactions?: StatementTransactionExtraction[];
}

export interface StatementTransactionExtraction {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
}

export interface ReceiptExtraction {
  kind: 'receipt';
  merchantName?: string;
  merchantAddress?: string;
  date?: string;
  currency?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  paymentMethod?: string;
  items?: ReceiptItemExtraction[];
}

export interface ReceiptItemExtraction {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}
