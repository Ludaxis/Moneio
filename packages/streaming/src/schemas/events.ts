/**
 * Event Schemas for Kafka Messages
 *
 * All events include standard metadata for tracing and auditing.
 */

import type { UUID } from '@moneio/core-ledger';

/**
 * Base event metadata included in all messages
 */
export interface EventMetadata {
  /** Unique event ID */
  eventId: string;

  /** ISO timestamp when event was created */
  timestamp: string;

  /** Workspace ID for multi-tenancy */
  workspaceId: UUID;

  /** Correlation ID for tracing related events */
  correlationId?: string;

  /** User ID who triggered the event (if applicable) */
  userId?: string;

  /** Source service/component */
  source: string;
}

/**
 * Base event structure
 */
export interface BaseEvent<T = unknown> {
  metadata: EventMetadata;
  payload: T;
}

// ============================================
// CSV Import Events
// ============================================

export interface CsvUploadedPayload {
  importId: string;
  fileName: string;
  fileSize: number;
  rowCount: number;
  headers: string[];
}

export interface CsvRowPayload {
  importId: string;
  rowIndex: number;
  data: Record<string, string>;
  headers: string[];
}

export interface CsvRowSkippedPayload {
  importId: string;
  rowIndex: number;
  data: Record<string, string>;
  reason: string;
  analysisFlags?: {
    isTurnover: boolean;
    isOpeningBalance: boolean;
    isClosingBalance: boolean;
    isSummaryRow: boolean;
  };
}

// ============================================
// Transaction Events
// ============================================

export interface TransactionImportedPayload {
  importId: string;
  transactionId: UUID;
  date: string;
  description: string;
  amount: number;
  currency: string;
  balance?: number;
  reference?: string;
}

export interface TransactionCategorizationRequestedPayload {
  transactionId: UUID;
  description: string;
  amount: number;
  currency: string;
  counterparty?: string;
  reference?: string;
}

export interface TransactionCategorizedPayload {
  transactionId: UUID;
  categoryId: UUID;
  categoryName: string;
  confidence: number;
  method: 'rule' | 'heuristic' | 'ai';
  reasoning?: string;
  matchedRuleId?: UUID;
}

// ============================================
// AI Suggestion Events
// ============================================

export interface AiSuggestionPayload {
  suggestionId: UUID;
  transactionId: UUID;
  categoryId: UUID;
  categoryName: string;
  confidence: number;
  reasoning: string;
  modelInfo?: {
    provider: string;
    model: string;
  };
}

// ============================================
// Anomaly Events
// ============================================

export type AnomalyType =
  | 'duplicate'
  | 'spending_spike'
  | 'unusual_merchant'
  | 'velocity_alert'
  | 'pattern_deviation';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyDetectedPayload {
  anomalyId: string;
  transactionId: UUID;
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  details: Record<string, unknown>;
  evidence?: {
    relatedTransactionIds?: UUID[];
    expectedValue?: number;
    actualValue?: number;
    deviation?: number;
  };
}

// ============================================
// Type-safe Event Types
// ============================================

export type CsvUploadedEvent = BaseEvent<CsvUploadedPayload>;
export type CsvRowEvent = BaseEvent<CsvRowPayload>;
export type CsvRowSkippedEvent = BaseEvent<CsvRowSkippedPayload>;
export type TransactionImportedEvent = BaseEvent<TransactionImportedPayload>;
export type TransactionCategorizationRequestedEvent =
  BaseEvent<TransactionCategorizationRequestedPayload>;
export type TransactionCategorizedEvent = BaseEvent<TransactionCategorizedPayload>;
export type AiSuggestionEvent = BaseEvent<AiSuggestionPayload>;
export type AnomalyDetectedEvent = BaseEvent<AnomalyDetectedPayload>;

/**
 * Create event metadata
 */
export function createEventMetadata(
  workspaceId: UUID,
  source: string,
  options?: {
    correlationId?: string;
    userId?: string;
  }
): EventMetadata {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    workspaceId,
    source,
    correlationId: options?.correlationId,
    userId: options?.userId,
  };
}

/**
 * Create a typed event
 */
export function createEvent<T>(
  workspaceId: UUID,
  source: string,
  payload: T,
  options?: {
    correlationId?: string;
    userId?: string;
  }
): BaseEvent<T> {
  return {
    metadata: createEventMetadata(workspaceId, source, options),
    payload,
  };
}
