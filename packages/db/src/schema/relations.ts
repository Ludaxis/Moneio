// Schema relations
import { relations } from 'drizzle-orm';

import { users, workspaces, workspaceMembers } from './core.js';
import { documents, documentBlobs, ocrArtifacts, extractions } from './documents.js';
import {
  merchants,
  categories,
  invoices,
  invoiceLineItems,
  bankAccounts,
  bankTransactions,
} from './financial.js';
import { transactionCategorizations, rules, matches } from './categorization.js';
import { aiSuggestions, auditLog } from './ai.js';

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  workspaceMemberships: many(workspaceMembers),
  createdDocuments: many(documents),
}));

// Workspace relations
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  documents: many(documents),
  merchants: many(merchants),
  categories: many(categories),
  invoices: many(invoices),
  bankAccounts: many(bankAccounts),
  bankTransactions: many(bankTransactions),
  rules: many(rules),
  matches: many(matches),
  aiSuggestions: many(aiSuggestions),
  auditLog: many(auditLog),
}));

// Workspace member relations
export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
}));

// Document relations
export const documentsRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [documents.createdByUserId],
    references: [users.id],
  }),
  blobs: many(documentBlobs),
  ocrArtifacts: many(ocrArtifacts),
  extractions: many(extractions),
  invoices: many(invoices),
  bankTransactions: many(bankTransactions),
}));

// Document blob relations
export const documentBlobsRelations = relations(documentBlobs, ({ one }) => ({
  document: one(documents, {
    fields: [documentBlobs.documentId],
    references: [documents.id],
  }),
}));

// OCR artifact relations
export const ocrArtifactsRelations = relations(ocrArtifacts, ({ one }) => ({
  document: one(documents, {
    fields: [ocrArtifacts.documentId],
    references: [documents.id],
  }),
}));

// Extraction relations
export const extractionsRelations = relations(extractions, ({ one }) => ({
  document: one(documents, {
    fields: [extractions.documentId],
    references: [documents.id],
  }),
}));

// Merchant relations
export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [merchants.workspaceId],
    references: [workspaces.id],
  }),
  invoices: many(invoices),
}));

// Category relations
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [categories.workspaceId],
    references: [workspaces.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  children: many(categories),
  bankTransactions: many(bankTransactions),
  categorizations: many(transactionCategorizations),
}));

// Invoice relations
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [invoices.workspaceId],
    references: [workspaces.id],
  }),
  document: one(documents, {
    fields: [invoices.documentId],
    references: [documents.id],
  }),
  merchant: one(merchants, {
    fields: [invoices.merchantId],
    references: [merchants.id],
  }),
  lineItems: many(invoiceLineItems),
  matches: many(matches),
}));

// Invoice line item relations
export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
}));

// Bank account relations
export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [bankAccounts.workspaceId],
    references: [workspaces.id],
  }),
  transactions: many(bankTransactions),
}));

// Bank transaction relations
export const bankTransactionsRelations = relations(bankTransactions, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [bankTransactions.workspaceId],
    references: [workspaces.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [bankTransactions.bankAccountId],
    references: [bankAccounts.id],
  }),
  document: one(documents, {
    fields: [bankTransactions.documentId],
    references: [documents.id],
  }),
  category: one(categories, {
    fields: [bankTransactions.categoryId],
    references: [categories.id],
  }),
  categorizations: many(transactionCategorizations),
  matches: many(matches),
}));

// Transaction categorization relations
export const transactionCategorizationsRelations = relations(
  transactionCategorizations,
  ({ one }) => ({
    transaction: one(bankTransactions, {
      fields: [transactionCategorizations.transactionId],
      references: [bankTransactions.id],
    }),
    category: one(categories, {
      fields: [transactionCategorizations.categoryId],
      references: [categories.id],
    }),
  })
);

// Rule relations
export const rulesRelations = relations(rules, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [rules.workspaceId],
    references: [workspaces.id],
  }),
}));

// Match relations
export const matchesRelations = relations(matches, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [matches.workspaceId],
    references: [workspaces.id],
  }),
  invoice: one(invoices, {
    fields: [matches.invoiceId],
    references: [invoices.id],
  }),
  transaction: one(bankTransactions, {
    fields: [matches.transactionId],
    references: [bankTransactions.id],
  }),
}));

// AI suggestion relations
export const aiSuggestionsRelations = relations(aiSuggestions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [aiSuggestions.workspaceId],
    references: [workspaces.id],
  }),
  reviewedBy: one(users, {
    fields: [aiSuggestions.reviewedByUserId],
    references: [users.id],
  }),
}));

// Audit log relations
export const auditLogRelations = relations(auditLog, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [auditLog.workspaceId],
    references: [workspaces.id],
  }),
  actor: one(users, {
    fields: [auditLog.actorUserId],
    references: [users.id],
  }),
}));
