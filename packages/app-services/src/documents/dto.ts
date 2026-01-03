/**
 * Document DTOs - API request/response types
 */

import { z } from 'zod';

// Supported MIME types for document uploads
const SUPPORTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
] as const;

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// Query parameters schema for GET /api/documents
export const documentListQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(['uploaded', 'processing', 'ocr_complete', 'extracting', 'ready', 'failed'])
    .optional(),
});

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

// Body schema for POST /api/documents
export const createDocumentBodySchema = z.object({
  fileName: z.string().min(1).max(512),
  mimeType: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (value) =>
        SUPPORTED_DOCUMENT_MIME_TYPES.includes(
          value as (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number]
        ),
      {
        message: 'Unsupported MIME type',
      }
    ),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  storagePath: z.string().min(1).max(1024),
});

export type CreateDocumentInput = z.infer<typeof createDocumentBodySchema>;

// Document DTO
export interface DocumentDto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// List response
export interface DocumentListDto {
  documents: DocumentDto[];
  total: number;
  limit: number;
  offset: number;
}

// Create response
export interface CreateDocumentDto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  createdAt: string;
}
