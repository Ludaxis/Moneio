/**
 * Kafka Topic Definitions
 *
 * All topics follow the naming convention: moneio.<domain>.<event>
 */

export const TOPICS = {
  // CSV Import Pipeline
  CSV_UPLOADED: 'moneio.csv.uploaded',
  CSV_PARSED: 'moneio.csv.parsed',
  CSV_ROWS_EXTRACTED: 'moneio.csv.rows',
  CSV_ROW_SKIPPED: 'moneio.csv.row.skipped',

  // Transaction Pipeline
  TRANSACTIONS_IMPORTED: 'moneio.transactions.imported',
  TRANSACTIONS_CATEGORIZATION_REQUESTED: 'moneio.transactions.categorization.requested',
  TRANSACTIONS_CATEGORIZED: 'moneio.transactions.categorized',
  TRANSACTIONS_UPDATED: 'moneio.transactions.updated',

  // AI Events
  AI_SUGGESTION_CREATED: 'moneio.ai.suggestion.created',
  AI_SUGGESTION_APPROVED: 'moneio.ai.suggestion.approved',
  AI_SUGGESTION_REJECTED: 'moneio.ai.suggestion.rejected',

  // Alerts & Anomalies
  ANOMALY_DETECTED: 'moneio.alerts.anomaly',
  SPENDING_ALERT: 'moneio.alerts.spending',
  DUPLICATE_DETECTED: 'moneio.alerts.duplicate',

  // Document Pipeline
  DOCUMENT_UPLOADED: 'moneio.documents.uploaded',
  DOCUMENT_PROCESSED: 'moneio.documents.processed',
  DOCUMENT_EXTRACTED: 'moneio.documents.extracted',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

/**
 * Topic configuration for creation
 */
export interface TopicConfig {
  name: TopicName;
  partitions: number;
  replicationFactor: number;
  retentionMs: number;
}

/**
 * Default topic configurations
 */
export const DEFAULT_TOPIC_CONFIGS: Record<string, Partial<TopicConfig>> = {
  // High-throughput topics need more partitions
  [TOPICS.CSV_ROWS_EXTRACTED]: {
    partitions: 6,
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  [TOPICS.TRANSACTIONS_CATEGORIZED]: {
    partitions: 6,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
  },
  // Alert topics need longer retention
  [TOPICS.ANOMALY_DETECTED]: {
    partitions: 3,
    retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
};

/**
 * Get topic configuration with defaults
 */
export function getTopicConfig(topic: TopicName): TopicConfig {
  const defaults: TopicConfig = {
    name: topic,
    partitions: 3,
    replicationFactor: 3,
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days default
  };

  return {
    ...defaults,
    ...DEFAULT_TOPIC_CONFIGS[topic],
  };
}
