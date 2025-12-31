/**
 * Instrumented LLM Client Wrapper
 *
 * Wraps LLM clients with Datadog APM instrumentation for
 * comprehensive observability of all LLM operations.
 */

import { createHash } from 'crypto';

import type { ModelInfo } from '@moneio/ai';

import { addLlmTelemetry, finishSpan, startLlmSpan } from '../tracer';
import type { LlmContext, LlmTelemetry, TokenPricing } from '../types';
import { MODEL_PRICING } from '../types';

import { LlmMetricsCollector } from './metrics';

/**
 * Interface for LLM clients that can be instrumented
 */
export interface InstrumentableLlmClient {
  complete(prompt: string, schema?: unknown): Promise<string>;
  getModelInfo(): ModelInfo;
}

/**
 * Options for the instrumented client
 */
export interface InstrumentedClientOptions {
  /** Application context */
  context: Partial<LlmContext>;
  /** Collect detailed metrics */
  collectMetrics?: boolean;
  /** Log prompts (hashed for privacy) */
  logPrompts?: boolean;
  /** Custom tags */
  tags?: Record<string, string>;
  /** Metrics collector instance */
  metricsCollector?: LlmMetricsCollector;
}

/**
 * Result from an instrumented LLM call
 */
export interface InstrumentedResult {
  /** LLM response */
  response: string;
  /** Telemetry data */
  telemetry: LlmTelemetry;
  /** Span ID for correlation */
  spanId: string;
  /** Trace ID for distributed tracing */
  traceId: string;
}

/**
 * Instrumented LLM Client
 *
 * Wraps any LLM client to add Datadog APM tracing and metrics collection.
 */
export class InstrumentedLlmClient implements InstrumentableLlmClient {
  private readonly client: InstrumentableLlmClient;
  private readonly options: InstrumentedClientOptions;
  private readonly metricsCollector: LlmMetricsCollector;

  constructor(client: InstrumentableLlmClient, options: InstrumentedClientOptions) {
    this.client = client;
    this.options = {
      collectMetrics: true,
      logPrompts: false,
      ...options,
    };
    this.metricsCollector = options.metricsCollector || new LlmMetricsCollector();
  }

  /**
   * Complete a prompt with full instrumentation
   */
  async complete(prompt: string, schema?: unknown): Promise<string> {
    const modelInfo = this.client.getModelInfo();
    const startTime = Date.now();

    // Create span for this LLM call
    const context: LlmContext = {
      operationType: this.options.context.operationType || 'other',
      environment: this.options.context.environment || process.env.NODE_ENV || 'development',
      ...this.options.context,
    };

    const span = startLlmSpan(`llm.${modelInfo.provider}.complete`, {
      context,
      tags: {
        'llm.provider': modelInfo.provider,
        'llm.model': modelInfo.model,
        ...this.options.tags,
      },
    });

    // Add prompt hash for tracking (not actual prompt for privacy)
    if (this.options.logPrompts) {
      const promptHash = this.hashPrompt(prompt);
      span.setTag('llm.prompt_hash', promptHash);
      span.setTag('llm.prompt_length', prompt.length);
    }

    let response: string;
    let telemetry: LlmTelemetry;

    try {
      response = await this.client.complete(prompt, schema);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Estimate tokens (rough estimation, actual count depends on tokenizer)
      const estimatedInputTokens = this.estimateTokens(prompt);
      const estimatedOutputTokens = this.estimateTokens(response);
      const totalTokens = estimatedInputTokens + estimatedOutputTokens;

      // Calculate cost
      const cost = this.calculateCost(modelInfo.model, estimatedInputTokens, estimatedOutputTokens);

      telemetry = {
        provider: modelInfo.provider,
        model: modelInfo.model,
        modelVersion: modelInfo.version,
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens,
        estimatedCost: cost,
        completionTime: duration,
        jsonMode: true, // Moneio uses JSON mode
        streaming: false,
        finishReason: 'stop',
      };

      // Add telemetry to span
      addLlmTelemetry(span, telemetry);

      // Collect metrics
      if (this.options.collectMetrics) {
        this.metricsCollector.recordLlmCall({
          provider: modelInfo.provider,
          model: modelInfo.model,
          operationType: context.operationType,
          duration,
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          cost,
          success: true,
          workspaceId: context.workspaceId,
        });
      }

      finishSpan(span);
      return response;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      telemetry = {
        provider: modelInfo.provider,
        model: modelInfo.model,
        modelVersion: modelInfo.version,
        completionTime: duration,
        jsonMode: true,
        streaming: false,
      };

      addLlmTelemetry(span, telemetry);

      // Record failed call metrics
      if (this.options.collectMetrics) {
        this.metricsCollector.recordLlmCall({
          provider: modelInfo.provider,
          model: modelInfo.model,
          operationType: context.operationType,
          duration,
          success: false,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          workspaceId: context.workspaceId,
        });
      }

      finishSpan(span, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Complete with full telemetry data returned
   */
  async completeWithTelemetry(prompt: string, schema?: unknown): Promise<InstrumentedResult> {
    const modelInfo = this.client.getModelInfo();
    const startTime = Date.now();

    const context: LlmContext = {
      operationType: this.options.context.operationType || 'other',
      environment: this.options.context.environment || process.env.NODE_ENV || 'development',
      ...this.options.context,
    };

    const span = startLlmSpan(`llm.${modelInfo.provider}.complete`, {
      context,
      tags: {
        'llm.provider': modelInfo.provider,
        'llm.model': modelInfo.model,
        ...this.options.tags,
      },
    });

    const spanContext = span.context();
    const spanId = spanContext.toSpanId();
    const traceId = spanContext.toTraceId();

    try {
      const response = await this.client.complete(prompt, schema);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const estimatedInputTokens = this.estimateTokens(prompt);
      const estimatedOutputTokens = this.estimateTokens(response);
      const totalTokens = estimatedInputTokens + estimatedOutputTokens;
      const cost = this.calculateCost(modelInfo.model, estimatedInputTokens, estimatedOutputTokens);

      const telemetry: LlmTelemetry = {
        provider: modelInfo.provider,
        model: modelInfo.model,
        modelVersion: modelInfo.version,
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens,
        estimatedCost: cost,
        completionTime: duration,
        jsonMode: true,
        streaming: false,
        finishReason: 'stop',
      };

      addLlmTelemetry(span, telemetry);
      finishSpan(span);

      return {
        response,
        telemetry,
        spanId,
        traceId,
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      const telemetry: LlmTelemetry = {
        provider: modelInfo.provider,
        model: modelInfo.model,
        completionTime: duration,
        jsonMode: true,
        streaming: false,
      };

      addLlmTelemetry(span, telemetry);
      finishSpan(span, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get model info from underlying client
   */
  getModelInfo(): ModelInfo {
    return this.client.getModelInfo();
  }

  /**
   * Get the metrics collector for accessing aggregated data
   */
  getMetricsCollector(): LlmMetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Estimate token count from text
   * Uses a simple approximation: ~4 characters per token
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate estimated cost based on model pricing
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing: TokenPricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const inputCost = (inputTokens / 1000) * pricing.inputPricePerK;
    const outputCost = (outputTokens / 1000) * pricing.outputPricePerK;
    return inputCost + outputCost;
  }

  /**
   * Hash prompt for privacy-safe tracking
   */
  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }
}

/**
 * Create an instrumented wrapper around any LLM client
 */
export function instrumentLlmClient(
  client: InstrumentableLlmClient,
  options: InstrumentedClientOptions
): InstrumentedLlmClient {
  return new InstrumentedLlmClient(client, options);
}

/**
 * Higher-order function to instrument an LLM client factory
 */
export function createInstrumentedClientFactory<T extends InstrumentableLlmClient>(
  factory: (...args: unknown[]) => T
): (options: InstrumentedClientOptions, ...args: unknown[]) => InstrumentedLlmClient {
  return (options: InstrumentedClientOptions, ...args: unknown[]) => {
    const client = factory(...args);
    return instrumentLlmClient(client, options);
  };
}
