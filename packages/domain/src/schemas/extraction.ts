// Extraction and AI validation schemas
import { z } from 'zod';

import { currencyCodeSchema, uuidSchema } from './common';

// Extraction output schemas
export const invoiceLineItemExtractionSchema = z.object({
  description: z.string(),
  quantity: z.number().nullish(),
  unitPrice: z.number().nullish(),
  vatRate: z.number().min(0).max(1).nullish(),
  lineTotal: z.number().nullish(),
});

export const invoiceExtractionSchema = z.object({
  kind: z.literal('invoice'),
  invoiceNumber: z.string().nullish(),
  issueDate: z.string().nullish(),
  dueDate: z.string().nullish(),
  vendorName: z.string().nullish(),
  vendorAddress: z.string().nullish(),
  vendorVatId: z.string().nullish(),
  buyerName: z.string().nullish(),
  buyerAddress: z.string().nullish(),
  buyerVatId: z.string().nullish(),
  currency: currencyCodeSchema.nullish(),
  subtotal: z.number().nullish(),
  vatTotal: z.number().nullish(),
  total: z.number().nullish(),
  lineItems: z.array(invoiceLineItemExtractionSchema).nullish(),
});

export const statementTransactionExtractionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  balance: z.number().nullish(),
  reference: z.string().nullish(),
});

export const statementExtractionSchema = z.object({
  kind: z.literal('statement'),
  accountNumber: z.string().nullish(),
  accountName: z.string().nullish(),
  bankName: z.string().nullish(),
  iban: z.string().nullish(),
  currency: currencyCodeSchema.nullish(),
  periodStart: z.string().nullish(),
  periodEnd: z.string().nullish(),
  openingBalance: z.number().nullish(),
  closingBalance: z.number().nullish(),
  transactions: z.array(statementTransactionExtractionSchema).nullish(),
});

export const receiptItemExtractionSchema = z.object({
  description: z.string(),
  quantity: z.number().nullish(),
  unitPrice: z.number().nullish(),
  total: z.number().nullish(),
});

export const receiptExtractionSchema = z.object({
  kind: z.literal('receipt'),
  merchantName: z.string().nullish(),
  merchantAddress: z.string().nullish(),
  date: z.string().nullish(),
  currency: currencyCodeSchema.nullish(),
  subtotal: z.number().nullish(),
  vatTotal: z.number().nullish(),
  total: z.number().nullish(),
  paymentMethod: z.string().nullish(),
  items: z.array(receiptItemExtractionSchema).nullish(),
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
