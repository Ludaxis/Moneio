// Categorization and rules schema
import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { workspaces } from './core.js';
import { categories, bankTransactions, invoices } from './financial.js';

// Enums
export const categorizationMethodEnum = pgEnum('categorization_method', ['ai', 'rule', 'user']);
export const ruleKindEnum = pgEnum('rule_kind', [
  'merchant_match',
  'contains_text',
  'amount_range',
  'iban_match',
]);
export const matchTypeEnum = pgEnum('match_type', ['exact', 'partial', 'suggested']);
export const matchStatusEnum = pgEnum('match_status', ['suggested', 'approved', 'rejected']);

// Transaction categorizations table
export const transactionCategorizations = pgTable('transaction_categorizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id')
    .notNull()
    .references(() => bankTransactions.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  method: categorizationMethodEnum('method').notNull().default('user'),
  confidence: integer('confidence'), // 0-100
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Rules table
export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: ruleKindEnum('kind').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  conditionJson: text('condition_json').notNull(), // JSON
  actionJson: text('action_json').notNull(), // JSON
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// Matches table (invoice to transaction reconciliation)
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  transactionId: uuid('transaction_id')
    .notNull()
    .references(() => bankTransactions.id, { onDelete: 'cascade' }),
  matchType: matchTypeEnum('match_type').notNull().default('suggested'),
  status: matchStatusEnum('status').notNull().default('suggested'),
  confidence: integer('confidence'), // 0-100
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// Type exports
export type TransactionCategorization = typeof transactionCategorizations.$inferSelect;
export type NewTransactionCategorization = typeof transactionCategorizations.$inferInsert;
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
