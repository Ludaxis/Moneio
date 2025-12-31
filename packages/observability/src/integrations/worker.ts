/**
 * Worker Integration
 *
 * Provides easy integration with the BullMQ worker for LLM observability.
 */

import type { Job } from 'bullmq';

import { DetectionRuleEvaluator, createDatadogActionHandler } from '../detection/evaluator';
import { InstrumentedLlmClient, instrumentLlmClient } from '../llm/instrumented-client';
import type { InstrumentableLlmClient } from '../llm/instrumented-client';
import { getGlobalMetricsCollector } from '../llm/metrics';
import { addLlmTelemetry, finishSpan, getTracer, initializeTracer, startLlmSpan } from '../tracer';
import type { LlmContext, LlmOperationType, LlmTelemetry } from '../types';

/**
 * Worker observability configuration
 */
export interface WorkerObservabilityConfig {
  serviceName?: string;
  environment?: string;
  enableDetectionRules?: boolean;
  evaluationIntervalMs?: number;
}

/**
 * Initialize observability for the worker
 */
export function initializeWorkerObservability(config: WorkerObservabilityConfig = {}): void {
  // Initialize Datadog tracer
  initializeTracer({
    serviceName: config.serviceName || 'moneio-worker',
    environment: config.environment || process.env.NODE_ENV || 'development',
    llmObservability: true,
    globalTags: {
      'app.type': 'worker',
    },
  });

  // Start detection rule evaluation
  if (config.enableDetectionRules !== false) {
    const collector = getGlobalMetricsCollector();
    const evaluator = new DetectionRuleEvaluator({
      metricsCollector: collector,
      actionHandler: createDatadogActionHandler(),
    });
    evaluator.start(config.evaluationIntervalMs || 60000);
  }

  console.log(
    JSON.stringify({
      dd: { service: config.serviceName || 'moneio-worker' },
      message: 'observability.initialized',
      level: 'info',
      config: {
        serviceName: config.serviceName || 'moneio-worker',
        environment: config.environment || process.env.NODE_ENV,
        detectionRules: config.enableDetectionRules !== false,
      },
    })
  );
}

/**
 * Create an instrumented LLM client for worker jobs
 */
export function createInstrumentedWorkerClient(
  client: InstrumentableLlmClient,
  job: Job,
  operationType: LlmOperationType
): InstrumentedLlmClient {
  const context: Partial<LlmContext> = {
    operationType,
    environment: process.env.NODE_ENV || 'development',
    jobId: job.id,
    workspaceId: job.data.workspaceId,
    documentId: job.data.documentId,
    documentType: job.data.documentType,
  };

  return instrumentLlmClient(client, {
    context,
    collectMetrics: true,
    logPrompts: true,
    tags: {
      'job.name': job.name,
      'job.queue': job.queueName,
    },
    metricsCollector: getGlobalMetricsCollector(),
  });
}

/**
 * Wrap a job handler with tracing
 */
export function traceJobHandler<T, R>(
  jobName: string,
  handler: (job: Job<T>) => Promise<R>
): (job: Job<T>) => Promise<R> {
  return async (job: Job<T>): Promise<R> => {
    const tracer = getTracer();
    const span = tracer.startSpan(`job.${jobName}`, {
      tags: {
        'span.type': 'worker',
        'job.id': job.id,
        'job.name': job.name,
        'job.queue': job.queueName,
        'job.attempts': job.attemptsMade,
      },
    });

    // Add job data as tags (be careful with sensitive data)
    if (job.data && typeof job.data === 'object') {
      const data = job.data as Record<string, unknown>;
      if (data['workspaceId']) {
        span.setTag('workspace.id', String(data['workspaceId']));
      }
      if (data['documentId']) {
        span.setTag('document.id', String(data['documentId']));
      }
      if (data['documentType']) {
        span.setTag('document.type', String(data['documentType']));
      }
    }

    try {
      const result = await tracer.scope().activate(span, () => handler(job));
      span.setTag('job.status', 'completed');
      span.finish();
      return result;
    } catch (error) {
      span.setTag('error', true);
      span.setTag('job.status', 'failed');
      if (error instanceof Error) {
        span.setTag('error.message', error.message);
        span.setTag('error.type', error.name);
        if (error.stack) {
          span.setTag('error.stack', error.stack);
        }
      }
      span.finish();
      throw error;
    }
  };
}

/**
 * Job progress tracker with observability
 */
export class JobProgressTracker {
  private readonly job: Job;
  private readonly span: ReturnType<typeof startLlmSpan>;
  private readonly startTime: number;

  constructor(job: Job, operationType: LlmOperationType) {
    this.job = job;
    this.startTime = Date.now();
    this.span = startLlmSpan(`job.${job.name}`, {
      context: {
        operationType,
        environment: process.env.NODE_ENV || 'development',
        jobId: job.id,
        workspaceId: job.data?.workspaceId,
        documentId: job.data?.documentId,
      },
      tags: {
        'job.id': job.id || '',
        'job.name': job.name,
        'job.queue': job.queueName,
      },
    });
  }

  /**
   * Update job progress
   */
  async updateProgress(progress: number, stage?: string): Promise<void> {
    await this.job.updateProgress(progress);

    if (stage) {
      this.span.setTag('job.stage', stage);
    }
    this.span.setTag('job.progress', progress);
  }

  /**
   * Add LLM telemetry to the job span
   */
  addLlmTelemetry(telemetry: LlmTelemetry): void {
    addLlmTelemetry(this.span, telemetry);
  }

  /**
   * Complete the job successfully
   */
  complete(result?: unknown): void {
    const duration = Date.now() - this.startTime;
    this.span.setTag('job.status', 'completed');
    this.span.setTag('job.duration_ms', duration);
    if (result !== undefined) {
      this.span.setTag('job.has_result', true);
    }
    finishSpan(this.span);
  }

  /**
   * Mark the job as failed
   */
  fail(error: Error): void {
    const duration = Date.now() - this.startTime;
    this.span.setTag('job.status', 'failed');
    this.span.setTag('job.duration_ms', duration);
    finishSpan(this.span, error);
  }
}

/**
 * Create a job progress tracker
 */
export function createJobProgressTracker(
  job: Job,
  operationType: LlmOperationType
): JobProgressTracker {
  return new JobProgressTracker(job, operationType);
}
