// Database package - Prisma ORM with Supabase PostgreSQL
export { prisma } from './client';
export type { PrismaClient } from './client';
export * from './health';
export { seedWorkspaceCategories, defaultCategories } from './categories';
export {
  seedWorkspaceChartOfAccounts,
  hasChartOfAccounts,
  defaultChartOfAccounts,
} from './gl-seed';

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
export {
  DocumentStatus,
  DocumentType,
  SuggestionType,
  AccountType,
  NormalBalance,
  JournalStatus,
  PeriodStatus,
  Prisma,
} from '@prisma/client';

// Re-export GL model types
export type {
  GLAccount,
  JournalEntry,
  JournalLine,
  AccountingPeriod,
  GLBalance,
} from '@prisma/client';
