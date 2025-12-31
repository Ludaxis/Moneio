/**
 * Datadog LLM Observability Initialization
 *
 * This module initializes Datadog APM and LLM Observability for the worker service.
 * IMPORTANT: This should be imported at the very top of the application entry point,
 * before any other imports, to ensure proper instrumentation.
 *
 * @example
 * ```typescript
 * // In apps/worker/src/index.ts - FIRST LINE
 * import './lib/datadog';
 *
 * // Then other imports...
 * import { Worker } from 'bullmq';
 * ```
 */

import { initializeWorkerObservability, getGlobalMetricsCollector } from '@moneio/observability';

import { logger } from './logger';

/**
 * Initialize Datadog observability if enabled
 */
function initialize(): void {
  // Check if Datadog is enabled
  const datadogEnabled =
    process.env.DD_ENABLED === 'true' || process.env.DATADOG_ENABLED === 'true';

  if (!datadogEnabled) {
    logger.info('Datadog observability disabled (set DD_ENABLED=true to enable)');
    return;
  }

  try {
    initializeWorkerObservability({
      serviceName: process.env.DD_SERVICE || 'moneio-worker',
      environment: process.env.DD_ENV || process.env.NODE_ENV || 'development',
      enableDetectionRules: true,
      evaluationIntervalMs: 60000, // Evaluate detection rules every minute
    });

    logger.info(
      {
        service: process.env.DD_SERVICE || 'moneio-worker',
        environment: process.env.DD_ENV || process.env.NODE_ENV,
      },
      'Datadog LLM Observability initialized'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Datadog observability');
    // Don't throw - allow the worker to continue without observability
  }
}

// Initialize on import
initialize();

/**
 * Get LLM metrics summary for health checks
 */
export function getLlmMetricsSummary() {
  try {
    const collector = getGlobalMetricsCollector();
    return collector.getAggregatedMetrics(300000); // Last 5 minutes
  } catch {
    return null;
  }
}

/**
 * Flush metrics before shutdown
 */
export function flushMetrics(): void {
  try {
    const collector = getGlobalMetricsCollector();
    collector.flushToDatadog();
  } catch {
    // Ignore errors during shutdown
  }
}
