// Document validation schemas
import { z } from 'zod';

import { uuidSchema } from './common';

export const documentTypeSchema = z.enum(['invoice', 'statement', 'receipt', 'other']);

export const documentStatusSchema = z.enum(['uploaded', 'processing', 'ready', 'failed']);

export const documentSourceSchema = z.enum(['upload', 'email', 'mobile']);

export const createDocumentSchema = z.object({
  workspaceId: uuidSchema,
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(255),
  type: documentTypeSchema.optional().default('other'),
  source: documentSourceSchema.optional().default('upload'),
});

export const updateDocumentSchema = z.object({
  type: documentTypeSchema.optional(),
  status: documentStatusSchema.optional(),
  pageCount: z.number().int().min(1).optional(),
});

export const documentFilterSchema = z.object({
  workspaceId: uuidSchema,
  type: documentTypeSchema.optional(),
  status: documentStatusSchema.optional(),
  source: documentSourceSchema.optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
});

// Supported MIME types
export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'text/csv',
] as const;

export const supportedMimeTypeSchema = z.enum(SUPPORTED_DOCUMENT_MIME_TYPES);

// Type exports
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type DocumentSource = z.infer<typeof documentSourceSchema>;
export type CreateDocument = z.infer<typeof createDocumentSchema>;
export type UpdateDocument = z.infer<typeof updateDocumentSchema>;
export type DocumentFilter = z.infer<typeof documentFilterSchema>;
