// Documents schema
import {
  bigint,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users, workspaces } from './core.js';

// Enums
export const documentTypeEnum = pgEnum('document_type', ['invoice', 'statement', 'receipt', 'other']);
export const documentStatusEnum = pgEnum('document_status', [
  'uploaded',
  'processing',
  'ready',
  'failed',
]);
export const documentSourceEnum = pgEnum('document_source', ['upload', 'email', 'mobile']);
export const storageProviderEnum = pgEnum('storage_provider', ['local', 's3', 'gcs', 'azure', 'supabase']);
export const extractionKindEnum = pgEnum('extraction_kind', ['invoice', 'statement', 'receipt']);
export const extractionCreatorEnum = pgEnum('extraction_creator', ['ai', 'user']);

// Documents table
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: documentTypeEnum('type').notNull().default('other'),
    status: documentStatusEnum('status').notNull().default('uploaded'),
    fileName: varchar('file_name', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }).notNull(),
    pageCount: integer('page_count').notNull().default(1),
    source: documentSourceEnum('source').notNull().default('upload'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => ({
    workspaceCreatedAtIdx: index('doc_workspace_created_at_idx').on(
      table.workspaceId,
      table.createdAt
    ),
    workspaceStatusIdx: index('doc_workspace_status_idx').on(table.workspaceId, table.status),
  })
);

// Document blobs table
export const documentBlobs = pgTable('document_blobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  storageProvider: storageProviderEnum('storage_provider').notNull().default('local'),
  storageKey: text('storage_key').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// OCR artifacts table
export const ocrArtifacts = pgTable('ocr_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  payloadJson: text('payload_json').notNull(), // JSON stored as text
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Extractions table
export const extractions = pgTable('extractions', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  kind: extractionKindEnum('kind').notNull(),
  payloadJson: text('payload_json').notNull(), // JSON stored as text
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }),
  createdBy: extractionCreatorEnum('created_by').notNull().default('ai'),
  modelInfo: varchar('model_info', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentBlob = typeof documentBlobs.$inferSelect;
export type NewDocumentBlob = typeof documentBlobs.$inferInsert;
export type OcrArtifact = typeof ocrArtifacts.$inferSelect;
export type NewOcrArtifact = typeof ocrArtifacts.$inferInsert;
export type Extraction = typeof extractions.$inferSelect;
export type NewExtraction = typeof extractions.$inferInsert;
