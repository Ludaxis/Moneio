// Database package - Prisma ORM with Supabase PostgreSQL
export { prisma } from './client';
export type { PrismaClient } from './client';
export * from './health';

// Re-export Prisma types for convenience
export type {
  User,
  Workspace,
  WorkspaceMember,
  Document,
  DocumentBlob,
  OcrArtifact,
  Extraction,
  Merchant,
  Invoice,
  InvoiceLineItem,
  BankAccount,
  BankTransaction,
  Category,
  TransactionCategorization,
  Rule,
  Match,
  AiSuggestion,
  AuditLog,
  FxRate,
  DocumentStatus,
  DocumentType,
  SuggestionType,
} from '@prisma/client';
