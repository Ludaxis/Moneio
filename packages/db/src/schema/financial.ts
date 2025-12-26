// Financial entities schema
import {
  bigint,
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { workspaces } from './core.js';
import { documents } from './documents.js';

// Enums
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'approved', 'paid', 'void']);
export const categoryTypeEnum = pgEnum('category_type', ['income', 'expense', 'transfer']);

// Merchants table
export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  nameNormalized: varchar('name_normalized', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  country: varchar('country', { length: 2 }),
  vatId: varchar('vat_id', { length: 50 }),
  category: varchar('category', { length: 100 }),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// Categories table
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  type: categoryTypeEnum('type').notNull(),
  parentId: uuid('parent_id'),
  color: varchar('color', { length: 7 }),
  icon: varchar('icon', { length: 50 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// Invoices table
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
  invoiceNumber: varchar('invoice_number', { length: 100 }),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  subtotalAmount: bigint('subtotal_amount', { mode: 'number' }).notNull().default(0),
  vatTotalAmount: bigint('vat_total_amount', { mode: 'number' }).notNull().default(0),
  totalAmount: bigint('total_amount', { mode: 'number' }).notNull().default(0),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// Invoice line items table
export const invoiceLineItems = pgTable('invoice_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull().default('1'),
  unitPriceAmount: bigint('unit_price_amount', { mode: 'number' }).notNull(),
  vatRate: numeric('vat_rate', { precision: 5, scale: 4 }).notNull().default('0'),
  lineTotalAmount: bigint('line_total_amount', { mode: 'number' }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Bank accounts table
export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  iban: varchar('iban', { length: 34 }),
  accountNumber: varchar('account_number', { length: 50 }),
  bankName: varchar('bank_name', { length: 255 }),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// Bank transactions table
export const bankTransactions = pgTable('bank_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  bankAccountId: uuid('bank_account_id')
    .notNull()
    .references(() => bankAccounts.id, { onDelete: 'cascade' }),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
  descriptionRaw: text('description_raw').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  counterparty: varchar('counterparty', { length: 255 }),
  reference: varchar('reference', { length: 255 }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  isReconciled: boolean('is_reconciled').notNull().default(false),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// FX rates table
export const fxRates = pgTable('fx_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  baseCurrency: varchar('base_currency', { length: 3 }).notNull(),
  quoteCurrency: varchar('quote_currency', { length: 3 }).notNull(),
  rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports
export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;
export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
