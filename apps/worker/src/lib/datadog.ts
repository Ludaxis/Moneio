/**
 * Datadog LLM Observability Initialization
 *
 * This module initializes Datadog APM and LLM Observability for the worker service.
 * IMPORTANT: This should be imported at the very top of the application entry point,
 * before any other imports, to ensure proper instrumentation.
 *
 * Required environment variables:
 * - DD_SITE: Datadog site (use 'datadoghq.eu' for EU)
 * - DD_LLMOBS_ENABLED: Set to "1" to enable LLM Observability
 * - DD_LLMOBS_ML_APP: Application name for grouping traces (e.g., "moneio")
 *
 * For agentless mode (no Datadog Agent):
 * - DD_LLMOBS_AGENTLESS_ENABLED: Set to "1"
 * - DD_API_KEY: Your Datadog API key
 *
 * @example
 * ```bash
 * # EU configuration with agent
 * DD_SITE=datadoghq.eu DD_LLMOBS_ENABLED=1 DD_LLMOBS_ML_APP=moneio node worker.js
 *
 * # EU configuration agentless
 * DD_SITE=datadoghq.eu DD_LLMOBS_ENABLED=1 DD_LLMOBS_ML_APP=moneio \
 *   DD_LLMOBS_AGENTLESS_ENABLED=1 DD_API_KEY=xxx node worker.js
 * ```
 *
 * @see https://docs.datadoghq.com/llm_observability/setup/
 */

import {
  getGlobalMetricsCollector,
  initializeWorkerObservability,
  isLlmObsEnabled,
  getDatadogSite,
} from '@moneio/observability';

import { logger } from './logger';

/**
 * Get LLM Observability configuration summary
 */
export function getLlmObsConfig() {
  return {
    enabled: isLlmObsEnabled(),
    site: getDatadogSite(),
    mlApp: process.env.DD_LLMOBS_ML_APP || 'moneio',
    agentless:
      process.env.DD_LLMOBS_AGENTLESS_ENABLED === '1' ||
      process.env.DD_LLMOBS_AGENTLESS_ENABLED === 'true',
    hasApiKey: !!process.env.DD_API_KEY,
  };
}

/**
 * Initialize Datadog observability if enabled
 */
function initialize(): void {
  // Check if LLM Observability is enabled using official env var
  const llmObsEnabled = isLlmObsEnabled();

  if (!llmObsEnabled) {
    logger.info(
      'Datadog LLM Observability disabled. To enable, set: DD_LLMOBS_ENABLED=1 DD_LLMOBS_ML_APP=moneio DD_SITE=datadoghq.eu'
    );
    return;
  }

  const config = getLlmObsConfig();

  // Validate configuration
  if (config.agentless && !config.hasApiKey) {
    logger.warn(
      'DD_LLMOBS_AGENTLESS_ENABLED is set but DD_API_KEY is missing. Agentless mode requires an API key.'
    );
  }

  try {
    initializeWorkerObservability({
      serviceName: process.env.DD_SERVICE || process.env.DD_LLMOBS_ML_APP || 'moneio-worker',
      environment: process.env.DD_ENV || process.env.NODE_ENV || 'development',
      enableDetectionRules: true,
      evaluationIntervalMs: 60000, // Evaluate detection rules every minute
    });

    logger.info(
      {
        site: config.site,
        mlApp: config.mlApp,
        agentless: config.agentless,
        service: process.env.DD_SERVICE || process.env.DD_LLMOBS_ML_APP || 'moneio-worker',
        environment: process.env.DD_ENV || process.env.NODE_ENV,
      },
      'Datadog LLM Observability initialized'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Datadog LLM Observability');
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
