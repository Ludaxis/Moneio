// AI and audit schema
import { integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users, workspaces } from './core.js';

// Enums
export const aiSubjectTypeEnum = pgEnum('ai_subject_type', [
  'invoice',
  'transaction',
  'document',
  'match',
]);
export const aiSuggestionTypeEnum = pgEnum('ai_suggestion_type', [
  'extract',
  'categorize',
  'match',
  'enrich',
]);
export const aiSuggestionStatusEnum = pgEnum('ai_suggestion_status', [
  'pending',
  'accepted',
  'rejected',
]);

// AI suggestions table
export const aiSuggestions = pgTable('ai_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  subjectType: aiSubjectTypeEnum('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  suggestionType: aiSuggestionTypeEnum('suggestion_type').notNull(),
  payloadJson: text('payload_json').notNull(), // JSON
  confidence: integer('confidence').notNull(), // 0-100
  evidenceJson: text('evidence_json'), // JSON array
  modelInfo: varchar('model_info', { length: 255 }),
  status: aiSuggestionStatusEnum('status').notNull().default('pending'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Audit log table
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  beforeJson: text('before_json'), // JSON
  afterJson: text('after_json'), // JSON
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type NewAiSuggestion = typeof aiSuggestions.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
