/**
 * Core streaming types
 */

import type { BaseEvent } from './schemas/events';
import type { TopicName } from './topics';

/**
 * Message to be sent to a topic
 */
export interface ProducerMessage<T = unknown> {
  topic: TopicName;
  key?: string;
  value: T;
  headers?: Record<string, string>;
}

/**
 * Message received from a topic
 */
export interface ConsumerMessage<T = unknown> {
  topic: TopicName;
  partition: number;
  offset: string;
  key?: string;
  value: T;
  headers?: Record<string, string>;
  timestamp: string;
}

/**
 * Producer interface for sending messages
 */
export interface StreamingProducer {
  /**
   * Send a single message to a topic
   */
  send<T>(message: ProducerMessage<T>): Promise<void>;

  /**
   * Send multiple messages in a batch
   */
  sendBatch<T>(messages: ProducerMessage<T>[]): Promise<void>;

  /**
   * Disconnect the producer
   */
  disconnect(): Promise<void>;
}

/**
 * Message handler for consumer
 */
export type MessageHandler<T = unknown> = (message: ConsumerMessage<T>) => Promise<void>;

/**
 * Consumer interface for receiving messages
 */
export interface StreamingConsumer {
  /**
   * Subscribe to topics
   */
  subscribe(topics: TopicName[]): Promise<void>;

  /**
   * Start consuming messages
   */
  run<T>(handler: MessageHandler<T>): Promise<void>;

  /**
   * Stop consuming and disconnect
   */
  disconnect(): Promise<void>;

  /**
   * Pause consumption
   */
  pause(): void;

  /**
   * Resume consumption
   */
  resume(): void;
}

/**
 * Consumer group configuration
 */
export interface ConsumerConfig {
  groupId: string;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  maxBytesPerPartition?: number;
  fromBeginning?: boolean;
}

/**
 * Streaming client interface
 */
export interface StreamingClient {
  /**
   * Create a producer
   */
  createProducer(): Promise<StreamingProducer>;

  /**
   * Create a consumer
   */
  createConsumer(config: ConsumerConfig): Promise<StreamingConsumer>;

  /**
   * Check if streaming is available
   */
  isAvailable(): boolean;

  /**
   * Get client type
   */
  getClientType(): 'confluent' | 'memory';

  /**
   * Disconnect all resources
   */
  disconnect(): Promise<void>;
}

/**
 * Event emitter for in-memory streaming
 */
export interface EventEmitter {
  emit<T>(topic: TopicName, event: BaseEvent<T>): void;
  on<T>(topic: TopicName, handler: (event: BaseEvent<T>) => void): void;
  off<T>(topic: TopicName, handler: (event: BaseEvent<T>) => void): void;
}
