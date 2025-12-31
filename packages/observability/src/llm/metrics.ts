/**
 * LLM Metrics Collector
 *
 * Collects and aggregates LLM usage metrics for Datadog custom metrics.
 */

import { getTracer } from '../tracer';
import type { LlmOperationType } from '../types';

/**
 * LLM call record for metrics
 */
export interface LlmCallRecord {
  provider: string;
  model: string;
  operationType: LlmOperationType;
  duration: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  success: boolean;
  errorType?: string;
  workspaceId?: string;
}

/**
 * Aggregated metrics for a time window
 */
export interface AggregatedMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  errorRate: number;
  byProvider: Record<string, ProviderMetrics>;
  byModel: Record<string, ModelMetrics>;
  byOperationType: Record<string, OperationMetrics>;
}

interface ProviderMetrics {
  calls: number;
  tokens: number;
  cost: number;
  errors: number;
}

interface ModelMetrics {
  calls: number;
  tokens: number;
  cost: number;
  avgDuration: number;
}

interface OperationMetrics {
  calls: number;
  avgDuration: number;
  successRate: number;
}

/**
 * LLM Metrics Collector
 *
 * Collects metrics in memory and exports to Datadog custom metrics.
 */
export class LlmMetricsCollector {
  private records: LlmCallRecord[] = [];
  private readonly maxRecords: number;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: { maxRecords?: number; flushIntervalMs?: number } = {}) {
    this.maxRecords = options.maxRecords || 10000;

    // Start periodic flush to Datadog
    if (options.flushIntervalMs) {
      this.flushInterval = setInterval(() => this.flushToDatadog(), options.flushIntervalMs);
    }
  }

  /**
   * Record an LLM call
   */
  recordLlmCall(record: LlmCallRecord): void {
    this.records.push(record);

    // Trim old records if exceeding max
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    // Submit individual metrics to Datadog
    this.submitMetrics(record);
  }

  /**
   * Submit metrics to Datadog via tracer
   */
  private submitMetrics(record: LlmCallRecord): void {
    const tracer = getTracer();
    const tags = [
      `provider:${record.provider}`,
      `model:${record.model}`,
      `operation:${record.operationType}`,
      `success:${record.success}`,
    ];

    if (record.workspaceId) {
      tags.push(`workspace:${record.workspaceId}`);
    }
    if (record.errorType) {
      tags.push(`error_type:${record.errorType}`);
    }

    // Submit to Datadog DogStatsD
    const scope = tracer.scope();
    const span = scope.active();

    if (span) {
      // Add metrics as span tags for APM correlation
      span.setTag('llm.metrics.duration_ms', record.duration);
      if (record.inputTokens) {
        span.setTag('llm.metrics.input_tokens', record.inputTokens);
      }
      if (record.outputTokens) {
        span.setTag('llm.metrics.output_tokens', record.outputTokens);
      }
      if (record.cost) {
        span.setTag('llm.metrics.cost_usd', record.cost);
      }
    }

    // Log metrics for Datadog log-based metrics
    console.log(
      JSON.stringify({
        dd: {
          service: 'moneio',
          env: process.env.NODE_ENV || 'development',
        },
        message: 'llm.request',
        level: 'info',
        llm: {
          provider: record.provider,
          model: record.model,
          operation_type: record.operationType,
          duration_ms: record.duration,
          input_tokens: record.inputTokens,
          output_tokens: record.outputTokens,
          total_tokens: (record.inputTokens || 0) + (record.outputTokens || 0),
          cost_usd: record.cost,
          success: record.success,
          error_type: record.errorType,
        },
        workspace_id: record.workspaceId,
      })
    );
  }

  /**
   * Get aggregated metrics for a time window
   */
  getAggregatedMetrics(
    windowMs: number = 3600000 // Default 1 hour
  ): AggregatedMetrics {
    // Filter records in time window (using record timestamp would be better)
    // TODO: Add timestamp to LlmCallRecord and filter by time window
    // For now, we return all records; in production, records should have timestamps
    void windowMs; // Mark as intentionally unused for now
    const recentRecords = this.records;

    const durations = recentRecords.map((r) => r.duration).sort((a, b) => a - b);

    const byProvider: Record<string, ProviderMetrics> = {};
    const byModel: Record<string, ModelMetrics> = {};
    const byOperationType: Record<string, OperationMetrics> = {};

    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let successCount = 0;

    for (const record of recentRecords) {
      const tokens = (record.inputTokens || 0) + (record.outputTokens || 0);
      totalTokens += tokens;
      totalInputTokens += record.inputTokens || 0;
      totalOutputTokens += record.outputTokens || 0;
      totalCost += record.cost || 0;

      if (record.success) successCount++;

      // Provider aggregation
      if (!byProvider[record.provider]) {
        byProvider[record.provider] = { calls: 0, tokens: 0, cost: 0, errors: 0 };
      }
      byProvider[record.provider].calls++;
      byProvider[record.provider].tokens += tokens;
      byProvider[record.provider].cost += record.cost || 0;
      if (!record.success) byProvider[record.provider].errors++;

      // Model aggregation
      if (!byModel[record.model]) {
        byModel[record.model] = { calls: 0, tokens: 0, cost: 0, avgDuration: 0 };
      }
      byModel[record.model].calls++;
      byModel[record.model].tokens += tokens;
      byModel[record.model].cost += record.cost || 0;

      // Operation type aggregation
      if (!byOperationType[record.operationType]) {
        byOperationType[record.operationType] = {
          calls: 0,
          avgDuration: 0,
          successRate: 0,
        };
      }
      byOperationType[record.operationType].calls++;
    }

    // Calculate model avg durations
    for (const model of Object.keys(byModel)) {
      const modelRecords = recentRecords.filter((r) => r.model === model);
      byModel[model].avgDuration =
        modelRecords.reduce((sum, r) => sum + r.duration, 0) / modelRecords.length;
    }

    // Calculate operation success rates
    for (const op of Object.keys(byOperationType)) {
      const opRecords = recentRecords.filter((r) => r.operationType === op);
      const opSuccess = opRecords.filter((r) => r.success).length;
      byOperationType[op].avgDuration =
        opRecords.reduce((sum, r) => sum + r.duration, 0) / opRecords.length;
      byOperationType[op].successRate = opRecords.length > 0 ? opSuccess / opRecords.length : 0;
    }

    return {
      totalCalls: recentRecords.length,
      successfulCalls: successCount,
      failedCalls: recentRecords.length - successCount,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      avgDuration:
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      p50Duration: this.percentile(durations, 50),
      p95Duration: this.percentile(durations, 95),
      p99Duration: this.percentile(durations, 99),
      errorRate:
        recentRecords.length > 0 ? (recentRecords.length - successCount) / recentRecords.length : 0,
      byProvider,
      byModel,
      byOperationType,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Flush aggregated metrics to Datadog
   */
  flushToDatadog(): void {
    const metrics = this.getAggregatedMetrics();

    // Log aggregated metrics for Datadog
    console.log(
      JSON.stringify({
        dd: {
          service: 'moneio',
          env: process.env.NODE_ENV || 'development',
        },
        message: 'llm.metrics.aggregated',
        level: 'info',
        metrics: {
          total_calls: metrics.totalCalls,
          successful_calls: metrics.successfulCalls,
          failed_calls: metrics.failedCalls,
          total_tokens: metrics.totalTokens,
          total_cost_usd: metrics.totalCost,
          avg_duration_ms: metrics.avgDuration,
          p50_duration_ms: metrics.p50Duration,
          p95_duration_ms: metrics.p95Duration,
          p99_duration_ms: metrics.p99Duration,
          error_rate: metrics.errorRate,
        },
        providers: metrics.byProvider,
        models: metrics.byModel,
        operations: metrics.byOperationType,
      })
    );
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Stop the flush interval
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Get raw records (for debugging/testing)
   */
  getRecords(): LlmCallRecord[] {
    return [...this.records];
  }
}

// Singleton instance for global metrics
let globalCollector: LlmMetricsCollector | null = null;

/**
 * Get the global metrics collector
 */
export function getGlobalMetricsCollector(): LlmMetricsCollector {
  if (!globalCollector) {
    globalCollector = new LlmMetricsCollector({
      maxRecords: 50000,
      flushIntervalMs: 60000, // Flush every minute
    });
  }
  return globalCollector;
}
