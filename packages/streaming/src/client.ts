/**
 * Streaming Client Factory
 *
 * Creates the appropriate streaming client based on environment configuration.
 * Falls back to in-memory when Confluent is not configured.
 */

import { createConfluentClient, isConfluentConfigured } from './adapters/confluent';
import { createInMemoryClient } from './adapters/memory';
import type { StreamingClient } from './types';

let clientInstance: StreamingClient | null = null;

/**
 * Check if streaming is enabled via feature flag
 */
export function isStreamingEnabled(): boolean {
  return process.env.ENABLE_STREAMING === 'true';
}

/**
 * Create or get the streaming client instance
 *
 * Uses Confluent Cloud if configured, otherwise falls back to in-memory.
 * The fallback ensures the application works without Confluent.
 */
export function createStreamingClient(): StreamingClient {
  if (clientInstance) {
    return clientInstance;
  }

  // Check if Confluent is configured
  if (isConfluentConfigured()) {
    const confluentClient = createConfluentClient();
    if (confluentClient) {
      console.log('[Streaming] Using Confluent Cloud');
      clientInstance = confluentClient;
      return clientInstance;
    }
  }

  // Fallback to in-memory
  console.log('[Streaming] Using in-memory event bus (Confluent not configured)');
  clientInstance = createInMemoryClient();
  return clientInstance;
}

/**
 * Get the current streaming client (throws if not initialized)
 */
export function getStreamingClient(): StreamingClient {
  if (!clientInstance) {
    return createStreamingClient();
  }
  return clientInstance;
}

/**
 * Reset the client instance (for testing)
 */
export function resetStreamingClient(): void {
  if (clientInstance) {
    clientInstance.disconnect().catch(console.error);
    clientInstance = null;
  }
}

/**
 * Check if currently using Confluent
 */
export function isUsingConfluent(): boolean {
  return clientInstance?.getClientType() === 'confluent';
}
