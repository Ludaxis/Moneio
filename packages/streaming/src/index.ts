// Streaming package exports

// Client
export {
  createStreamingClient,
  getStreamingClient,
  isStreamingEnabled,
  isUsingConfluent,
  resetStreamingClient,
} from './client';

// Topics
export { DEFAULT_TOPIC_CONFIGS, getTopicConfig, TOPICS } from './topics';
export type { TopicConfig, TopicName } from './topics';

// Types
export type {
  ConsumerConfig,
  ConsumerMessage,
  MessageHandler,
  ProducerMessage,
  StreamingClient,
  StreamingConsumer,
  StreamingProducer,
} from './types';

// Event Schemas
export { createEvent, createEventMetadata } from './schemas/events';
export type {
  AiSuggestionEvent,
  AiSuggestionPayload,
  AnomalyDetectedEvent,
  AnomalyDetectedPayload,
  AnomalySeverity,
  AnomalyType,
  BaseEvent,
  CsvRowEvent,
  CsvRowPayload,
  CsvRowSkippedEvent,
  CsvRowSkippedPayload,
  CsvUploadedEvent,
  CsvUploadedPayload,
  EventMetadata,
  TransactionCategorizedEvent,
  TransactionCategorizedPayload,
  TransactionCategorizationRequestedEvent,
  TransactionCategorizationRequestedPayload,
  TransactionImportedEvent,
  TransactionImportedPayload,
} from './schemas/events';

// Adapters
export { createInMemoryClient, InMemoryStreamingClient } from './adapters/memory';
export {
  ConfluentStreamingClient,
  createConfluentClient,
  getConfluentConfig,
  isConfluentConfigured,
} from './adapters/confluent';
export type { ConfluentConfig } from './adapters/confluent';
