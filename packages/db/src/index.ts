// Database package - Prisma ORM with Supabase PostgreSQL
export { prisma } from './client';
export type { PrismaClient } from './client';
export * from './health';
export { seedWorkspaceCategories, defaultCategories } from './categories';

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
} from '@prisma/client';

// Export enums as values (not just types)
export { DocumentStatus, DocumentType, SuggestionType } from '@prisma/client';
