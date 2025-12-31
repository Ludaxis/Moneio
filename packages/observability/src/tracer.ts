/**
 * Datadog Tracer Initialization
 *
 * Initializes the Datadog APM tracer with LLM Observability configuration.
 * Must be imported before any other modules in the application entry point.
 */

import tracer from 'dd-trace';
import type { Tracer, Span, SpanOptions } from 'dd-trace';

import type { LlmContext, LlmSpanMetadata, LlmTelemetry } from './types';

// Singleton tracer instance
let tracerInstance: Tracer | null = null;
let isInitialized = false;

/**
 * Datadog tracer configuration options
 */
export interface DatadogConfig {
  /** Service name */
  serviceName: string;
  /** Environment (production, staging, development) */
  environment: string;
  /** Datadog agent host */
  agentHost?: string;
  /** Datadog agent port */
  agentPort?: number;
  /** Enable LLM Observability */
  llmObservability?: boolean;
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
 * Default configuration
 */
const defaultConfig: DatadogConfig = {
  serviceName: 'moneio',
  environment: process.env.NODE_ENV || 'development',
  agentHost: process.env.DD_AGENT_HOST || 'localhost',
  agentPort: parseInt(process.env.DD_AGENT_PORT || '8126', 10),
  llmObservability: true,
  sampleRate: 1.0,
  debug: false,
  runtimeMetrics: true,
  logInjection: true,
};

/**
 * Initialize Datadog tracer with LLM Observability
 *
 * @param config - Tracer configuration
 * @returns Initialized tracer instance
 */
export function initializeTracer(config: Partial<DatadogConfig> = {}): Tracer {
  if (isInitialized && tracerInstance) {
    return tracerInstance;
  }

  const finalConfig = { ...defaultConfig, ...config };

  tracerInstance = tracer.init({
    service: finalConfig.serviceName,
    env: finalConfig.environment,
    hostname: finalConfig.agentHost,
    port: finalConfig.agentPort,
    sampleRate: finalConfig.sampleRate,
    logInjection: finalConfig.logInjection,
    runtimeMetrics: finalConfig.runtimeMetrics,
    tags: {
      ...finalConfig.globalTags,
      'llm.observability': String(finalConfig.llmObservability),
    },
  });

  isInitialized = true;

  // Log initialization
  if (finalConfig.debug) {
    console.log('[Datadog] Tracer initialized:', {
      service: finalConfig.serviceName,
      environment: finalConfig.environment,
      llmObservability: finalConfig.llmObservability,
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
