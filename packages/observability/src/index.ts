/**
 * @moneio/observability
 *
 * Datadog LLM Observability Package
 *
 * Provides comprehensive monitoring and alerting for LLM operations:
 * - APM tracing with LLM-specific telemetry
 * - Metrics collection for tokens, costs, and latency
 * - Anomaly detection rules
 * - Dashboard configurations
 * - Alert automations
 *
 * @example
 * ```typescript
 * import {
 *   initializeTracer,
 *   instrumentLlmClient,
 *   LLM_DETECTION_RULES,
 *   LLM_OBSERVABILITY_DASHBOARD,
 * } from '@moneio/observability';
 *
 * // Initialize tracer at app startup
 * initializeTracer({
 *   serviceName: 'moneio-worker',
 *   environment: 'production',
 * });
 *
 * // Wrap LLM client with instrumentation
 * const client = instrumentLlmClient(createGeminiClient(), {
 *   context: { operationType: 'document_extraction' },
 * });
 * ```
 */

// Core tracer
export {
  initializeTracer,
  getTracer,
  isTracerInitialized,
  isLlmObsEnabled,
  getDatadogSite,
  startLlmSpan,
  addLlmTelemetry,
  finishSpan,
  traceLlmOperation,
  getActiveSpan,
  runWithSpan,
  extractSpanMetadata,
} from './tracer';
export type { DatadogConfig, DatadogSite } from './tracer';

// LLM instrumentation
export {
  InstrumentedLlmClient,
  instrumentLlmClient,
  createInstrumentedClientFactory,
} from './llm/instrumented-client';
export type {
  InstrumentableLlmClient,
  InstrumentedClientOptions,
  InstrumentedResult,
} from './llm/instrumented-client';

// Metrics collection
export { LlmMetricsCollector, getGlobalMetricsCollector } from './llm/metrics';
export type { LlmCallRecord, AggregatedMetrics } from './llm/metrics';

// Detection rules
export {
  LLM_DETECTION_RULES,
  getRulesBySeverity,
  getRulesByType,
  getEnabledRules,
  exportAsDatadogRules,
} from './detection/rules';

export { DetectionRuleEvaluator, createDatadogActionHandler } from './detection/evaluator';
export type { RuleEvaluationResult, TriggeredAction } from './detection/evaluator';

// Dashboard configuration
export {
  LLM_OBSERVABILITY_DASHBOARD,
  COST_ANALYSIS_DASHBOARD,
  exportDashboardAsJson,
  getAllDashboards,
} from './dashboard/config';

// Alert configuration
export {
  LLM_ALERT_CONFIGS,
  exportAlertsAsJson,
  getAlertsBySeverity,
  getSecurityAlerts,
} from './alerts/config';

// Types
export type {
  LlmSpanMetadata,
  LlmTelemetry,
  LlmContext,
  LlmOperationType,
  LlmEvent,
  DetectionRule,
  DetectionRuleType,
  ThresholdConfig,
  DetectionAction,
  DashboardWidget,
  DashboardConfig,
  AlertConfig,
  TokenPricing,
} from './types';

export { MODEL_PRICING } from './types';

// Integrations
export {
  initializeWorkerObservability,
  createInstrumentedWorkerClient,
  traceJobHandler,
  JobProgressTracker,
  createJobProgressTracker,
} from './integrations/worker';
export type { WorkerObservabilityConfig } from './integrations/worker';

export {
  initializeNextJsObservability,
  createInstrumentedApiClient,
  traceApiRoute,
  extractLlmContext,
  logLlmRequest,
  logLlmResponse,
} from './integrations/nextjs';
export type { NextJsObservabilityConfig, LlmRequestContext } from './integrations/nextjs';
