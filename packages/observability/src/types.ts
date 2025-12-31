/**
 * Datadog LLM Observability Types
 *
 * These types define the structure for LLM telemetry data
 * sent to Datadog for monitoring and alerting.
 */

import type { UUID } from '@moneio/core-ledger';

/**
 * LLM span metadata for Datadog APM
 */
export interface LlmSpanMetadata {
  /** Unique span identifier */
  spanId: string;
  /** Trace ID for distributed tracing */
  traceId: string;
  /** Parent span ID if nested */
  parentSpanId?: string;
  /** Span operation name */
  operationName: string;
  /** Service name */
  serviceName: string;
  /** Resource name (e.g., model name) */
  resourceName: string;
  /** Start timestamp */
  startTime: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Span status */
  status: 'ok' | 'error';
  /** Error message if status is error */
  errorMessage?: string;
  /** Error type if status is error */
  errorType?: string;
}

/**
 * LLM-specific telemetry data
 */
export interface LlmTelemetry {
  /** LLM provider (google, openai, anthropic) */
  provider: string;
  /** Model identifier */
  model: string;
  /** Model version if available */
  modelVersion?: string;
  /** Input token count */
  inputTokens?: number;
  /** Output token count */
  outputTokens?: number;
  /** Total token count */
  totalTokens?: number;
  /** Estimated cost in USD */
  estimatedCost?: number;
  /** Temperature setting */
  temperature?: number;
  /** Max tokens setting */
  maxTokens?: number;
  /** Time to first token (streaming) */
  timeToFirstToken?: number;
  /** Total completion time */
  completionTime: number;
  /** Whether JSON mode was used */
  jsonMode?: boolean;
  /** Whether streaming was used */
  streaming?: boolean;
  /** Model fallback occurred */
  fallbackUsed?: boolean;
  /** Original model if fallback was used */
  originalModel?: string;
  /** Finish reason from LLM */
  finishReason?: string;
  /** Safety/content filter triggered */
  contentFiltered?: boolean;
}

/**
 * Application context for LLM calls
 */
export interface LlmContext {
  /** Workspace ID */
  workspaceId?: UUID;
  /** User ID */
  userId?: string;
  /** Document ID being processed */
  documentId?: UUID;
  /** Transaction ID being categorized */
  transactionId?: UUID;
  /** Job ID for background jobs */
  jobId?: string;
  /** Operation type */
  operationType: LlmOperationType;
  /** Document type if applicable */
  documentType?: 'invoice' | 'receipt' | 'statement' | 'unknown';
  /** Environment */
  environment: string;
}

/**
 * Types of LLM operations for categorization
 */
export type LlmOperationType =
  | 'document_extraction'
  | 'transaction_categorization'
  | 'csv_header_normalization'
  | 'financial_chat'
  | 'entity_extraction'
  | 'validation'
  | 'other';

/**
 * Complete LLM event for Datadog
 */
export interface LlmEvent {
  /** Event timestamp */
  timestamp: number;
  /** Span metadata */
  span: LlmSpanMetadata;
  /** LLM-specific telemetry */
  telemetry: LlmTelemetry;
  /** Application context */
  context: LlmContext;
  /** Custom tags */
  tags: Record<string, string | number | boolean>;
  /** Prompt hash for tracking (not the actual prompt for privacy) */
  promptHash?: string;
  /** Response confidence score if available */
  confidenceScore?: number;
}

/**
 * Anomaly detection rule configuration
 */
export interface DetectionRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Rule type */
  type: DetectionRuleType;
  /** Whether rule is enabled */
  enabled: boolean;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Metric to monitor */
  metric: string;
  /** Threshold configuration */
  threshold: ThresholdConfig;
  /** Time window for evaluation */
  timeWindow: string;
  /** Tags to filter events */
  filterTags?: Record<string, string>;
  /** Action to take when triggered */
  action: DetectionAction;
}

export type DetectionRuleType =
  | 'anomaly'
  | 'threshold'
  | 'rate_limit'
  | 'error_rate'
  | 'cost_spike'
  | 'latency'
  | 'security';

export interface ThresholdConfig {
  /** Comparison operator */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  /** Threshold value */
  value: number;
  /** Percentage for anomaly detection */
  anomalyPercentage?: number;
  /** Recovery threshold */
  recoveryValue?: number;
}

export interface DetectionAction {
  /** Action type */
  type: 'alert' | 'incident' | 'case' | 'webhook';
  /** Priority for incidents */
  priority?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  /** Team to notify */
  notifyTeam?: string;
  /** Additional context template */
  contextTemplate?: string;
}

/**
 * Dashboard widget configuration
 */
export interface DashboardWidget {
  /** Widget ID */
  id: string;
  /** Widget title */
  title: string;
  /** Widget type */
  type:
    | 'timeseries'
    | 'toplist'
    | 'query_value'
    | 'heatmap'
    | 'distribution'
    | 'table'
    | 'alert_graph';
  /** Datadog query */
  query: string;
  /** Display options */
  display?: {
    showLegend?: boolean;
    yAxisScale?: 'linear' | 'log';
    palette?: string;
  };
  /** Position and size */
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
  /** Dashboard title */
  title: string;
  /** Dashboard description */
  description: string;
  /** Dashboard layout type */
  layoutType: 'ordered' | 'free';
  /** Widgets */
  widgets: DashboardWidget[];
  /** Template variables */
  templateVariables?: {
    name: string;
    prefix: string;
    defaultValue: string;
  }[];
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  /** Alert name */
  name: string;
  /** Alert type */
  type: 'metric' | 'log' | 'apm' | 'composite';
  /** Query */
  query: string;
  /** Message template */
  message: string;
  /** Tags */
  tags: string[];
  /** Priority */
  priority?: number;
  /** Notification targets */
  notifyTargets: string[];
  /** Thresholds */
  thresholds: {
    critical?: number;
    warning?: number;
    ok?: number;
  };
  /** Evaluation window */
  evaluationWindow?: string;
  /** Recovery configuration */
  recovery?: {
    enabled: boolean;
    duration?: string;
  };
}

/**
 * Token pricing by model (USD per 1K tokens)
 */
export interface TokenPricing {
  inputPricePerK: number;
  outputPricePerK: number;
}

export const MODEL_PRICING: Record<string, TokenPricing> = {
  // Google Gemini
  'gemini-2.0-flash': { inputPricePerK: 0.0001, outputPricePerK: 0.0004 },
  'gemini-1.5-flash': { inputPricePerK: 0.000075, outputPricePerK: 0.0003 },
  'gemini-1.5-pro': { inputPricePerK: 0.00125, outputPricePerK: 0.005 },
  // OpenAI
  'gpt-4o': { inputPricePerK: 0.0025, outputPricePerK: 0.01 },
  'gpt-4o-mini': { inputPricePerK: 0.00015, outputPricePerK: 0.0006 },
  'gpt-4-turbo': { inputPricePerK: 0.01, outputPricePerK: 0.03 },
  // Default fallback
  default: { inputPricePerK: 0.001, outputPricePerK: 0.002 },
};
