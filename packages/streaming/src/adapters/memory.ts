/**
 * In-Memory Streaming Adapter
 *
 * Provides a local event bus for development and testing.
 * Falls back to this when Confluent is not configured.
 */

import type { TopicName } from '../topics';
import type {
  ConsumerConfig,
  ConsumerMessage,
  MessageHandler,
  ProducerMessage,
  StreamingClient,
  StreamingConsumer,
  StreamingProducer,
} from '../types';

type EventHandler = (message: ConsumerMessage<unknown>) => void;

/**
 * Simple in-memory event bus
 */
class InMemoryEventBus {
  private static instance: InMemoryEventBus;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private messageCounter = 0;

  static getInstance(): InMemoryEventBus {
    if (!InMemoryEventBus.instance) {
      InMemoryEventBus.instance = new InMemoryEventBus();
    }
    return InMemoryEventBus.instance;
  }

  emit<T>(
    topic: TopicName,
    key: string | undefined,
    value: T,
    headers?: Record<string, string>
  ): void {
    const handlers = this.handlers.get(topic);
    if (!handlers || handlers.size === 0) return;

    const message: ConsumerMessage<T> = {
      topic,
      partition: 0,
      offset: String(this.messageCounter++),
      key,
      value,
      headers,
      timestamp: new Date().toISOString(),
    };

    // Emit asynchronously to avoid blocking
    setImmediate(() => {
      handlers.forEach((handler) => {
        try {
          handler(message as ConsumerMessage<unknown>);
        } catch (error) {
          console.error(`[InMemoryEventBus] Handler error for topic ${topic}:`, error);
        }
      });
    });
  }

  subscribe(topic: TopicName, handler: EventHandler): void {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }
    this.handlers.get(topic)!.add(handler);
  }

  unsubscribe(topic: TopicName, handler: EventHandler): void {
    const handlers = this.handlers.get(topic);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  clear(): void {
    this.handlers.clear();
    this.messageCounter = 0;
  }
}

/**
 * In-memory producer
 */
class InMemoryProducer implements StreamingProducer {
  private readonly bus: InMemoryEventBus;

  constructor() {
    this.bus = InMemoryEventBus.getInstance();
  }

  async send<T>(message: ProducerMessage<T>): Promise<void> {
    this.bus.emit(message.topic, message.key, message.value, message.headers);
  }

  async sendBatch<T>(messages: ProducerMessage<T>[]): Promise<void> {
    for (const message of messages) {
      await this.send(message);
    }
  }

  async disconnect(): Promise<void> {
    // No-op for in-memory
  }
}

/**
 * In-memory consumer
 */
class InMemoryConsumer implements StreamingConsumer {
  private readonly bus: InMemoryEventBus;
  private readonly groupId: string;
  private subscribedTopics: TopicName[] = [];
  private handler: MessageHandler<unknown> | null = null;
  private boundHandler: EventHandler | null = null;
  private paused = false;

  constructor(config: ConsumerConfig) {
    this.bus = InMemoryEventBus.getInstance();
    this.groupId = config.groupId;
  }

  async subscribe(topics: TopicName[]): Promise<void> {
    this.subscribedTopics = topics;
  }

  async run<T>(handler: MessageHandler<T>): Promise<void> {
    this.handler = handler as MessageHandler<unknown>;

    this.boundHandler = async (message: ConsumerMessage<unknown>) => {
      if (this.paused) return;
      try {
        await this.handler!(message);
      } catch (error) {
        console.error(`[InMemoryConsumer:${this.groupId}] Handler error:`, error);
      }
    };

    for (const topic of this.subscribedTopics) {
      this.bus.subscribe(topic, this.boundHandler);
    }
  }

  async disconnect(): Promise<void> {
    if (this.boundHandler) {
      for (const topic of this.subscribedTopics) {
        this.bus.unsubscribe(topic, this.boundHandler);
      }
    }
    this.handler = null;
    this.boundHandler = null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }
}

/**
 * In-memory streaming client
 */
export class InMemoryStreamingClient implements StreamingClient {
  private producers: InMemoryProducer[] = [];
  private consumers: InMemoryConsumer[] = [];

  async createProducer(): Promise<StreamingProducer> {
    const producer = new InMemoryProducer();
    this.producers.push(producer);
    return producer;
  }

  async createConsumer(config: ConsumerConfig): Promise<StreamingConsumer> {
    const consumer = new InMemoryConsumer(config);
    this.consumers.push(consumer);
    return consumer;
  }

  isAvailable(): boolean {
    return true; // Always available
  }

  getClientType(): 'confluent' | 'memory' {
    return 'memory';
  }

  async disconnect(): Promise<void> {
    for (const producer of this.producers) {
      await producer.disconnect();
    }
    for (const consumer of this.consumers) {
      await consumer.disconnect();
    }
    this.producers = [];
    this.consumers = [];
  }

  /**
   * Clear all handlers and reset state (for testing)
   */
  reset(): void {
    InMemoryEventBus.getInstance().clear();
  }
}

/**
 * Create in-memory streaming client
 */
export function createInMemoryClient(): InMemoryStreamingClient {
  return new InMemoryStreamingClient();
}
