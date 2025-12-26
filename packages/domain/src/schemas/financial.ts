// Financial validation schemas
import { z } from 'zod';

import { currencyCodeSchema, moneySchema, uuidSchema } from './common.js';

// Invoice schemas
export const invoiceStatusSchema = z.enum(['draft', 'approved', 'paid', 'void']);

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  vatRate: z.number().min(0).max(1),
});

export const createInvoiceSchema = z.object({
  workspaceId: uuidSchema,
  documentId: uuidSchema.optional(),
  merchantId: uuidSchema.optional(),
  invoiceNumber: z.string().max(100).optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  currency: currencyCodeSchema,
  lineItems: z.array(invoiceLineItemSchema).optional(),
  notes: z.string().optional(),
});

export const updateInvoiceSchema = z.object({
  merchantId: uuidSchema.optional().nullable(),
  invoiceNumber: z.string().max(100).optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  status: invoiceStatusSchema.optional(),
  notes: z.string().optional(),
});

// Bank account schemas
export const createBankAccountSchema = z.object({
  workspaceId: uuidSchema,
  name: z.string().min(1).max(255),
  iban: z.string().max(34).optional(),
  accountNumber: z.string().max(50).optional(),
  bankName: z.string().max(255).optional(),
  currency: currencyCodeSchema,
});

export const updateBankAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  iban: z.string().max(34).optional().nullable(),
  accountNumber: z.string().max(50).optional().nullable(),
  bankName: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional(),
});

// Bank transaction schemas
export const createBankTransactionSchema = z.object({
  workspaceId: uuidSchema,
  bankAccountId: uuidSchema,
  postedAt: z.string().datetime(),
  descriptionRaw: z.string().min(1),
  amount: z.number().int(),
  currency: currencyCodeSchema,
  counterparty: z.string().max(255).optional(),
  reference: z.string().max(255).optional(),
});

export const updateBankTransactionSchema = z.object({
  categoryId: uuidSchema.optional().nullable(),
  documentId: uuidSchema.optional().nullable(),
  isReconciled: z.boolean().optional(),
});

export const bankTransactionFilterSchema = z.object({
  workspaceId: uuidSchema,
  bankAccountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  minAmount: z.number().int().optional(),
  maxAmount: z.number().int().optional(),
  isReconciled: z.boolean().optional(),
  searchQuery: z.string().optional(),
});

// Category schemas
export const categoryTypeSchema = z.enum(['income', 'expense', 'transfer']);

export const createCategorySchema = z.object({
  workspaceId: uuidSchema,
  name: z.string().min(1).max(100),
  type: categoryTypeSchema,
  parentId: uuidSchema.optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: uuidSchema.optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

// Merchant schemas
export const createMerchantSchema = z.object({
  workspaceId: uuidSchema,
  nameNormalized: z.string().min(1).max(255),
  displayName: z.string().max(255).optional(),
  country: z.string().length(2).optional(),
  vatId: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
});

export const updateMerchantSchema = z.object({
  displayName: z.string().max(255).optional().nullable(),
  country: z.string().length(2).optional().nullable(),
  vatId: z.string().max(50).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
});

// Type exports
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;
export type CreateInvoice = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoice = z.infer<typeof updateInvoiceSchema>;
export type CreateBankAccount = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccount = z.infer<typeof updateBankAccountSchema>;
export type CreateBankTransaction = z.infer<typeof createBankTransactionSchema>;
export type UpdateBankTransaction = z.infer<typeof updateBankTransactionSchema>;
export type BankTransactionFilter = z.infer<typeof bankTransactionFilterSchema>;
export type CategoryType = z.infer<typeof categoryTypeSchema>;
export type CreateCategory = z.infer<typeof createCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;
export type CreateMerchant = z.infer<typeof createMerchantSchema>;
export type UpdateMerchant = z.infer<typeof updateMerchantSchema>;
