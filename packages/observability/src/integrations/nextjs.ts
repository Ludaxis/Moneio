/**
 * Next.js Integration
 *
 * Provides middleware and utilities for Next.js API route observability.
 */

import type { NextRequest } from 'next/server';

import { instrumentLlmClient } from '../llm/instrumented-client';
import type { InstrumentableLlmClient } from '../llm/instrumented-client';
import { getGlobalMetricsCollector } from '../llm/metrics';
import { getTracer, initializeTracer } from '../tracer';
import type { LlmContext, LlmOperationType } from '../types';

/**
 * Next.js observability configuration
 */
export interface NextJsObservabilityConfig {
  serviceName?: string;
  environment?: string;
}

/**
 * Initialize observability for Next.js
 */
export function initializeNextJsObservability(config: NextJsObservabilityConfig = {}): void {
  initializeTracer({
    serviceName: config.serviceName || 'moneio-web',
    environment: config.environment || process.env.NODE_ENV || 'development',
    llmObservability: true,
    globalTags: {
      'app.type': 'web',
      framework: 'nextjs',
    },
  });
}

/**
 * Create an instrumented LLM client for API routes
 */
export function createInstrumentedApiClient(
  client: InstrumentableLlmClient,
  request: NextRequest,
  operationType: LlmOperationType
): ReturnType<typeof instrumentLlmClient> {
  // Extract workspace and user from headers/cookies if available
  const workspaceId = request.headers.get('x-workspace-id') || undefined;
  const userId = request.headers.get('x-user-id') || undefined;

  const context: Partial<LlmContext> = {
    operationType,
    environment: process.env.NODE_ENV || 'development',
    workspaceId,
    userId,
  };

  return instrumentLlmClient(client, {
    context,
    collectMetrics: true,
    logPrompts: false, // Don't log prompts in API routes by default
    tags: {
      'http.url': request.url,
      'http.method': request.method,
    },
    metricsCollector: getGlobalMetricsCollector(),
  });
}

/**
 * Wrap an API route handler with tracing
 */
export function traceApiRoute<T>(
  routeName: string,
  handler: (request: NextRequest, context?: T) => Promise<Response>
): (request: NextRequest, context?: T) => Promise<Response> {
  return async (request: NextRequest, context?: T): Promise<Response> => {
    const tracer = getTracer();
    const span = tracer.startSpan(`api.${routeName}`, {
      tags: {
        'span.type': 'web',
        'http.url': request.url,
        'http.method': request.method,
        'http.route': routeName,
      },
    });

    // Extract trace headers
    const traceId = request.headers.get('x-datadog-trace-id');
    const parentId = request.headers.get('x-datadog-parent-id');
    if (traceId) span.setTag('trace.parent_id', traceId);
    if (parentId) span.setTag('trace.parent_span_id', parentId);

    try {
      const response = await tracer.scope().activate(span, () => handler(request, context));

      span.setTag('http.status_code', response.status);
      span.finish();

      // Add trace headers to response
      const headers = new Headers(response.headers);
      headers.set('x-datadog-trace-id', span.context().toTraceId());
      headers.set('x-datadog-span-id', span.context().toSpanId());

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      span.setTag('error', true);
      span.setTag('http.status_code', 500);
      if (error instanceof Error) {
        span.setTag('error.message', error.message);
        span.setTag('error.type', error.name);
      }
      span.finish();
      throw error;
    }
  };
}

/**
 * Request context for LLM operations
 */
export interface LlmRequestContext {
  traceId: string;
  spanId: string;
  workspaceId?: string;
  userId?: string;
  operationType: LlmOperationType;
}

/**
 * Extract LLM context from request
 */
export function extractLlmContext(
  request: NextRequest,
  operationType: LlmOperationType
): LlmRequestContext {
  const tracer = getTracer();
  const span = tracer.scope().active();

  return {
    traceId: span?.context().toTraceId() || '',
    spanId: span?.context().toSpanId() || '',
    workspaceId: request.headers.get('x-workspace-id') || undefined,
    userId: request.headers.get('x-user-id') || undefined,
    operationType,
  };
}

/**
 * Log LLM request for observability
 */
export function logLlmRequest(
  request: NextRequest,
  operationType: LlmOperationType,
  metadata: Record<string, unknown> = {}
): void {
  console.log(
    JSON.stringify({
      dd: {
        service: 'moneio-web',
        env: process.env.NODE_ENV || 'development',
      },
      message: 'llm.api.request',
      level: 'info',
      http: {
        url: request.url,
        method: request.method,
      },
      llm: {
        operation_type: operationType,
        ...metadata,
      },
    })
  );
}

/**
 * Log LLM response for observability
 */
export function logLlmResponse(
  operationType: LlmOperationType,
  duration: number,
  success: boolean,
  metadata: Record<string, unknown> = {}
): void {
  console.log(
    JSON.stringify({
      dd: {
        service: 'moneio-web',
        env: process.env.NODE_ENV || 'development',
      },
      message: 'llm.api.response',
      level: success ? 'info' : 'error',
      llm: {
        operation_type: operationType,
        duration_ms: duration,
        success,
        ...metadata,
      },
    })
  );
}
