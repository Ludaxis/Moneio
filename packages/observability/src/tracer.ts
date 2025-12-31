/**
 * Datadog Tracer Initialization
 *
 * Initializes the Datadog APM tracer with LLM Observability configuration.
 * Must be imported before any other modules in the application entry point.
 *
 * Required environment variables for LLM Observability:
 * - DD_SITE: Datadog site (datadoghq.com, datadoghq.eu, etc.)
 * - DD_LLMOBS_ENABLED: Set to "1" or "true" to enable LLM Observability
 * - DD_LLMOBS_ML_APP: Application name for grouping LLM traces
 *
 * For agentless mode (no Datadog Agent running):
 * - DD_LLMOBS_AGENTLESS_ENABLED: Set to "1" or "true"
 * - DD_API_KEY: Your Datadog API key
 *
 * @see https://docs.datadoghq.com/llm_observability/setup/
 */

import tracer from 'dd-trace';
import type { Span, SpanOptions, Tracer } from 'dd-trace';

import type { LlmContext, LlmSpanMetadata, LlmTelemetry } from './types';

// Singleton tracer instance
let tracerInstance: Tracer | null = null;
let isInitialized = false;

/**
 * Supported Datadog sites
 * @see https://docs.datadoghq.com/getting_started/site/
 */
export type DatadogSite =
  | 'datadoghq.com' // US1
  | 'us3.datadoghq.com' // US3
  | 'us5.datadoghq.com' // US5
  | 'datadoghq.eu' // EU1
  | 'ap1.datadoghq.com' // AP1
  | 'ddog-gov.com'; // US1-FED

/**
 * Datadog tracer configuration options
 */
export interface DatadogConfig {
  /** Service name (DD_SERVICE) */
  serviceName: string;
  /** Environment (DD_ENV) */
  environment: string;
  /** Datadog site for data submission (DD_SITE) - use 'datadoghq.eu' for EU */
  site?: DatadogSite;
  /** Datadog agent host (DD_AGENT_HOST) */
  agentHost?: string;
  /** Datadog agent port (DD_AGENT_PORT) */
  agentPort?: number;
  /** Enable LLM Observability (DD_LLMOBS_ENABLED) */
  llmObservability?: boolean;
  /** LLM application name for grouping traces (DD_LLMOBS_ML_APP) */
  llmMlApp?: string;
  /** Enable agentless mode - requires DD_API_KEY (DD_LLMOBS_AGENTLESS_ENABLED) */
  agentless?: boolean;
  /** Datadog API key for agentless mode (DD_API_KEY) */
  apiKey?: string;
  /** Sample rate (0.0 - 1.0) */
  sampleRate?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom tags to add to all spans */
  globalTags?: Record<string, string>;
  /** Enable runtime metrics */
  runtimeMetrics?: boolean;
  /** Enable log injection */
  logInjection?: boolean;
}

/**
 * Get configuration from environment variables
 */
function getEnvConfig(): Partial<DatadogConfig> {
  return {
    serviceName: process.env.DD_SERVICE || process.env.DD_LLMOBS_ML_APP || 'moneio',
    environment: process.env.DD_ENV || process.env.NODE_ENV || 'development',
    site: (process.env.DD_SITE as DatadogSite) || 'datadoghq.com',
    agentHost: process.env.DD_AGENT_HOST || 'localhost',
    agentPort: parseInt(process.env.DD_AGENT_PORT || '8126', 10),
    llmObservability:
      process.env.DD_LLMOBS_ENABLED === '1' || process.env.DD_LLMOBS_ENABLED === 'true',
    llmMlApp: process.env.DD_LLMOBS_ML_APP,
    agentless:
      process.env.DD_LLMOBS_AGENTLESS_ENABLED === '1' ||
      process.env.DD_LLMOBS_AGENTLESS_ENABLED === 'true',
    apiKey: process.env.DD_API_KEY,
    debug: process.env.DD_TRACE_DEBUG === 'true',
  };
}

/**
 * Default configuration
 */
const defaultConfig: DatadogConfig = {
  serviceName: 'moneio',
  environment: 'development',
  site: 'datadoghq.com',
  agentHost: 'localhost',
  agentPort: 8126,
  llmObservability: false,
  sampleRate: 1.0,
  debug: false,
  runtimeMetrics: true,
  logInjection: true,
};

/**
 * Check if LLM Observability is enabled via environment
 */
export function isLlmObsEnabled(): boolean {
  return process.env.DD_LLMOBS_ENABLED === '1' || process.env.DD_LLMOBS_ENABLED === 'true';
}

/**
 * Get the configured Datadog site
 */
export function getDatadogSite(): DatadogSite {
  return (process.env.DD_SITE as DatadogSite) || 'datadoghq.com';
}

/**
 * Initialize Datadog tracer with LLM Observability
 *
 * @param config - Tracer configuration (overrides environment variables)
 * @returns Initialized tracer instance
 *
 * @example
 * ```typescript
 * // Using environment variables (recommended)
 * // Set: DD_SITE=datadoghq.eu DD_LLMOBS_ENABLED=1 DD_LLMOBS_ML_APP=moneio
 * initializeTracer();
 *
 * // Or with explicit config
 * initializeTracer({
 *   site: 'datadoghq.eu',
 *   llmObservability: true,
 *   llmMlApp: 'moneio',
 * });
 * ```
 */
export function initializeTracer(config: Partial<DatadogConfig> = {}): Tracer {
  if (isInitialized && tracerInstance) {
    return tracerInstance;
  }

  // Merge: defaults < env vars < explicit config
  const envConfig = getEnvConfig();
  const finalConfig = { ...defaultConfig, ...envConfig, ...config };

  // Build tracer options
  const tracerOptions: Parameters<typeof tracer.init>[0] = {
    service: finalConfig.serviceName,
    env: finalConfig.environment,
    sampleRate: finalConfig.sampleRate,
    logInjection: finalConfig.logInjection,
    runtimeMetrics: finalConfig.runtimeMetrics,
    tags: {
      ...finalConfig.globalTags,
    },
  };

  // Configure agent connection (unless agentless)
  if (!finalConfig.agentless) {
    tracerOptions.hostname = finalConfig.agentHost;
    tracerOptions.port = finalConfig.agentPort;
  }

  // Add LLM Observability tags if enabled
  if (finalConfig.llmObservability) {
    tracerOptions.tags = {
      ...tracerOptions.tags,
      'llm.observability.enabled': 'true',
    };

    if (finalConfig.llmMlApp) {
      tracerOptions.tags['llm.observability.ml_app'] = finalConfig.llmMlApp;
    }
  }

  tracerInstance = tracer.init(tracerOptions);

  isInitialized = true;

  // Log initialization
  if (finalConfig.debug) {
    console.log('[Datadog] Tracer initialized:', {
      service: finalConfig.serviceName,
      environment: finalConfig.environment,
      site: finalConfig.site,
      llmObservability: finalConfig.llmObservability,
      llmMlApp: finalConfig.llmMlApp,
      agentless: finalConfig.agentless,
    });
  }

  return tracerInstance;
}

/**
 * Get the current tracer instance
 */
export function getTracer(): Tracer {
  if (!tracerInstance) {
    return initializeTracer();
  }
  return tracerInstance;
}

/**
 * Check if tracer is initialized
 */
export function isTracerInitialized(): boolean {
  return isInitialized;
}

/**
 * Create a new span for LLM operations
 */
export function startLlmSpan(
  operationName: string,
  options: {
    context?: LlmContext;
    tags?: Record<string, string | number | boolean>;
    parentSpan?: Span;
  } = {}
): Span {
  const trace = getTracer();

  const spanOptions: SpanOptions = {
    tags: {
      'span.type': 'llm',
      'span.kind': 'client',
      ...options.tags,
    },
  };

  if (options.parentSpan) {
    spanOptions.childOf = options.parentSpan;
  }

  const span = trace.startSpan(operationName, spanOptions);

  // Add context tags
  if (options.context) {
    span.setTag('llm.operation_type', options.context.operationType);
    span.setTag('env', options.context.environment);

    if (options.context.workspaceId) {
      span.setTag('workspace.id', options.context.workspaceId);
    }
    if (options.context.userId) {
      span.setTag('user.id', options.context.userId);
    }
    if (options.context.documentId) {
      span.setTag('document.id', options.context.documentId);
    }
    if (options.context.jobId) {
      span.setTag('job.id', options.context.jobId);
    }
    if (options.context.documentType) {
      span.setTag('document.type', options.context.documentType);
    }
  }

  return span;
}

/**
 * Add LLM telemetry to a span
 */
export function addLlmTelemetry(span: Span, telemetry: LlmTelemetry): void {
  // LLM provider info
  span.setTag('llm.provider', telemetry.provider);
  span.setTag('llm.model', telemetry.model);

  if (telemetry.modelVersion) {
    span.setTag('llm.model_version', telemetry.modelVersion);
  }

  // Token usage
  if (telemetry.inputTokens !== undefined) {
    span.setTag('llm.input_tokens', telemetry.inputTokens);
  }
  if (telemetry.outputTokens !== undefined) {
    span.setTag('llm.output_tokens', telemetry.outputTokens);
  }
  if (telemetry.totalTokens !== undefined) {
    span.setTag('llm.total_tokens', telemetry.totalTokens);
  }

  // Cost
  if (telemetry.estimatedCost !== undefined) {
    span.setTag('llm.estimated_cost_usd', telemetry.estimatedCost);
  }

  // Configuration
  if (telemetry.temperature !== undefined) {
    span.setTag('llm.temperature', telemetry.temperature);
  }
  if (telemetry.maxTokens !== undefined) {
    span.setTag('llm.max_tokens', telemetry.maxTokens);
  }

  // Timing
  span.setTag('llm.completion_time_ms', telemetry.completionTime);
  if (telemetry.timeToFirstToken !== undefined) {
    span.setTag('llm.time_to_first_token_ms', telemetry.timeToFirstToken);
  }

  // Modes
  if (telemetry.jsonMode !== undefined) {
    span.setTag('llm.json_mode', telemetry.jsonMode);
  }
  if (telemetry.streaming !== undefined) {
    span.setTag('llm.streaming', telemetry.streaming);
  }

  // Fallback info
  if (telemetry.fallbackUsed) {
    span.setTag('llm.fallback_used', true);
    if (telemetry.originalModel) {
      span.setTag('llm.original_model', telemetry.originalModel);
    }
  }

  // Finish info
  if (telemetry.finishReason) {
    span.setTag('llm.finish_reason', telemetry.finishReason);
  }
  if (telemetry.contentFiltered) {
    span.setTag('llm.content_filtered', true);
  }
}

/**
 * Finish a span with optional error
 */
export function finishSpan(span: Span, error?: Error): void {
  if (error) {
    span.setTag('error', true);
    span.setTag('error.message', error.message);
    span.setTag('error.type', error.name);
    if (error.stack) {
      span.setTag('error.stack', error.stack);
    }
  }
  span.finish();
}

/**
 * Wrap an async function with LLM tracing
 */
export async function traceLlmOperation<T>(
  operationName: string,
  context: LlmContext,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const span = startLlmSpan(operationName, { context });

  try {
    const result = await fn(span);
    finishSpan(span);
    return result;
  } catch (error) {
    finishSpan(span, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Get current active span
 */
export function getActiveSpan(): Span | null {
  const trace = getTracer();
  return trace.scope().active();
}

/**
 * Run a function within a span context
 */
export function runWithSpan<T>(span: Span, fn: () => T): T {
  const trace = getTracer();
  return trace.scope().activate(span, fn);
}

/**
 * Extract span metadata for logging/metrics
 */
export function extractSpanMetadata(span: Span): LlmSpanMetadata {
  const context = span.context();

  return {
    spanId: context.toSpanId(),
    traceId: context.toTraceId(),
    operationName: 'llm.request',
    serviceName: 'moneio',
    resourceName: '',
    startTime: Date.now(),
    status: 'ok',
  };
}

export { tracer };
export type { Tracer, Span };
