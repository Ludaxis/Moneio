// Extraction and AI validation schemas
import { z } from 'zod';

import { currencyCodeSchema, uuidSchema } from './common';

// Extraction output schemas
export const invoiceLineItemExtractionSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  vatRate: z.number().min(0).max(1).optional(),
  lineTotal: z.number().optional(),
});

export const invoiceExtractionSchema = z.object({
  kind: z.literal('invoice'),
  invoiceNumber: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  vendorName: z.string().optional(),
  vendorAddress: z.string().optional(),
  vendorVatId: z.string().optional(),
  buyerName: z.string().optional(),
  buyerAddress: z.string().optional(),
  buyerVatId: z.string().optional(),
  currency: currencyCodeSchema.optional(),
  subtotal: z.number().optional(),
  vatTotal: z.number().optional(),
  total: z.number().optional(),
  lineItems: z.array(invoiceLineItemExtractionSchema).optional(),
});

export const statementTransactionExtractionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  balance: z.number().optional(),
  reference: z.string().optional(),
});

export const statementExtractionSchema = z.object({
  kind: z.literal('statement'),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  bankName: z.string().optional(),
  iban: z.string().optional(),
  currency: currencyCodeSchema.optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  openingBalance: z.number().optional(),
  closingBalance: z.number().optional(),
  transactions: z.array(statementTransactionExtractionSchema).optional(),
});

export const receiptItemExtractionSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  total: z.number().optional(),
});

export const receiptExtractionSchema = z.object({
  kind: z.literal('receipt'),
  merchantName: z.string().optional(),
  merchantAddress: z.string().optional(),
  date: z.string().optional(),
  currency: currencyCodeSchema.optional(),
  subtotal: z.number().optional(),
  vatTotal: z.number().optional(),
  total: z.number().optional(),
  paymentMethod: z.string().optional(),
  items: z.array(receiptItemExtractionSchema).optional(),
});

export const extractionPayloadSchema = z.discriminatedUnion('kind', [
  invoiceExtractionSchema,
  statementExtractionSchema,
  receiptExtractionSchema,
]);

// Evidence schema for AI suggestions
export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const aiEvidenceSchema = z.object({
  documentId: uuidSchema.optional(),
  page: z.number().int().min(1).optional(),
  boundingBox: boundingBoxSchema.optional(),
  sourceText: z.string().optional(),
  reasoning: z.string().optional(),
});

// AI suggestion schemas
export const aiSubjectTypeSchema = z.enum(['invoice', 'transaction', 'document', 'match']);

export const aiSuggestionTypeSchema = z.enum(['extract', 'categorize', 'match', 'enrich']);

export const createAiSuggestionSchema = z.object({
  workspaceId: uuidSchema,
  subjectType: aiSubjectTypeSchema,
  subjectId: uuidSchema,
  suggestionType: aiSuggestionTypeSchema,
  payloadJson: z.unknown(),
  confidence: z.number().int().min(0).max(100),
  evidenceJson: z.array(aiEvidenceSchema).optional(),
  modelInfo: z.string().max(255).optional(),
});

// Chat schemas
export const chatCitationSchema = z.object({
  type: z.enum(['document', 'invoice', 'transaction']),
  id: uuidSchema,
  title: z.string(),
  snippet: z.string().optional(),
  page: z.number().int().min(1).optional(),
  boundingBox: boundingBoxSchema.optional(),
});

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  citations: z.array(chatCitationSchema).optional(),
});

export const chatRequestSchema = z.object({
  workspaceId: uuidSchema,
  conversationId: uuidSchema.optional(),
  message: z.string().min(1).max(4000),
});

export const chatResponseSchema = z.object({
  conversationId: uuidSchema,
  message: chatMessageSchema,
  followUpQuestions: z.array(z.string()).optional(),
});

// Type exports
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
export type StatementExtraction = z.infer<typeof statementExtractionSchema>;
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;
export type ExtractionPayload = z.infer<typeof extractionPayloadSchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type AiEvidence = z.infer<typeof aiEvidenceSchema>;
export type AiSubjectType = z.infer<typeof aiSubjectTypeSchema>;
export type AiSuggestionType = z.infer<typeof aiSuggestionTypeSchema>;
export type CreateAiSuggestion = z.infer<typeof createAiSuggestionSchema>;
export type ChatCitation = z.infer<typeof chatCitationSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
