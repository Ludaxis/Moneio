/**
 * Dashboard Configuration
 *
 * Defines Datadog dashboard layouts for LLM observability.
 */

import type { DashboardConfig } from '../types';

/**
 * LLM Observability Dashboard Configuration
 *
 * Comprehensive dashboard for monitoring LLM operations, costs, and health.
 */
export const LLM_OBSERVABILITY_DASHBOARD: DashboardConfig = {
  title: 'LLM Observability - Moneio',
  description:
    'End-to-end monitoring for Gemini/Vertex AI LLM operations including latency, cost, errors, and security signals',
  layoutType: 'ordered',
  templateVariables: [
    {
      name: 'env',
      prefix: 'env',
      defaultValue: 'production',
    },
    {
      name: 'provider',
      prefix: 'llm.provider',
      defaultValue: '*',
    },
    {
      name: 'model',
      prefix: 'llm.model',
      defaultValue: '*',
    },
    {
      name: 'operation',
      prefix: 'llm.operation_type',
      defaultValue: '*',
    },
  ],
  widgets: [
    // === HEADER SECTION ===
    {
      id: 'header-health',
      title: 'LLM Service Health',
      type: 'query_value',
      query: `avg:llm.requests.success.rate{env:$env,llm.provider:$provider} * 100`,
      display: {
        palette: 'green_on_white',
      },
      layout: { x: 0, y: 0, width: 2, height: 2 },
    },
    {
      id: 'header-requests',
      title: 'Total LLM Requests (24h)',
      type: 'query_value',
      query: `sum:llm.requests.count{env:$env,llm.provider:$provider}.as_count()`,
      layout: { x: 2, y: 0, width: 2, height: 2 },
    },
    {
      id: 'header-cost',
      title: 'Estimated Cost (24h)',
      type: 'query_value',
      query: `sum:llm.estimated_cost_usd{env:$env,llm.provider:$provider}`,
      display: {
        palette: 'orange',
      },
      layout: { x: 4, y: 0, width: 2, height: 2 },
    },
    {
      id: 'header-latency',
      title: 'P95 Latency',
      type: 'query_value',
      query: `percentile:llm.completion_time_ms{env:$env,llm.provider:$provider} by {llm.model}.as_count() p:95`,
      layout: { x: 6, y: 0, width: 2, height: 2 },
    },
    {
      id: 'header-errors',
      title: 'Error Rate',
      type: 'query_value',
      query: `(sum:llm.requests.error{env:$env} / sum:llm.requests.count{env:$env}) * 100`,
      display: {
        palette: 'red_on_white',
      },
      layout: { x: 8, y: 0, width: 2, height: 2 },
    },
    {
      id: 'header-tokens',
      title: 'Total Tokens (24h)',
      type: 'query_value',
      query: `sum:llm.total_tokens{env:$env,llm.provider:$provider}`,
      layout: { x: 10, y: 0, width: 2, height: 2 },
    },

    // === REQUEST VOLUME SECTION ===
    {
      id: 'requests-timeline',
      title: 'LLM Requests Over Time',
      type: 'timeseries',
      query: `sum:llm.requests.count{env:$env,llm.provider:$provider} by {llm.model}.as_count()`,
      display: {
        showLegend: true,
      },
      layout: { x: 0, y: 2, width: 6, height: 3 },
    },
    {
      id: 'requests-by-operation',
      title: 'Requests by Operation Type',
      type: 'toplist',
      query: `sum:llm.requests.count{env:$env} by {llm.operation_type}.as_count()`,
      layout: { x: 6, y: 2, width: 3, height: 3 },
    },
    {
      id: 'requests-by-model',
      title: 'Model Distribution',
      type: 'toplist',
      query: `sum:llm.requests.count{env:$env,llm.provider:$provider} by {llm.model}.as_count()`,
      layout: { x: 9, y: 2, width: 3, height: 3 },
    },

    // === LATENCY SECTION ===
    {
      id: 'latency-percentiles',
      title: 'Latency Distribution (P50, P95, P99)',
      type: 'timeseries',
      query: `
        percentile:llm.completion_time_ms{env:$env,llm.model:$model} p:50,
        percentile:llm.completion_time_ms{env:$env,llm.model:$model} p:95,
        percentile:llm.completion_time_ms{env:$env,llm.model:$model} p:99
      `,
      display: {
        showLegend: true,
      },
      layout: { x: 0, y: 5, width: 6, height: 3 },
    },
    {
      id: 'latency-heatmap',
      title: 'Latency Heatmap',
      type: 'heatmap',
      query: `histogram:llm.completion_time_ms{env:$env,llm.provider:$provider}`,
      layout: { x: 6, y: 5, width: 6, height: 3 },
    },

    // === ERROR SECTION ===
    {
      id: 'error-rate-timeline',
      title: 'Error Rate Over Time',
      type: 'timeseries',
      query: `
        (sum:llm.requests.error{env:$env,llm.provider:$provider} by {llm.model}.as_count() /
         sum:llm.requests.count{env:$env,llm.provider:$provider} by {llm.model}.as_count()) * 100
      `,
      display: {
        showLegend: true,
        palette: 'warm',
      },
      layout: { x: 0, y: 8, width: 6, height: 3 },
    },
    {
      id: 'errors-by-type',
      title: 'Errors by Type',
      type: 'toplist',
      query: `sum:llm.requests.error{env:$env} by {error.type}.as_count()`,
      layout: { x: 6, y: 8, width: 3, height: 3 },
    },
    {
      id: 'error-logs',
      title: 'Recent LLM Errors',
      type: 'table',
      query: `logs("service:moneio llm.success:false").index("main").rollup("count").by("llm.model,error.message").last("15m")`,
      layout: { x: 9, y: 8, width: 3, height: 3 },
    },

    // === COST SECTION ===
    {
      id: 'cost-timeline',
      title: 'Estimated Cost Over Time',
      type: 'timeseries',
      query: `cumsum(sum:llm.estimated_cost_usd{env:$env,llm.provider:$provider} by {llm.model})`,
      display: {
        showLegend: true,
        palette: 'orange',
      },
      layout: { x: 0, y: 11, width: 6, height: 3 },
    },
    {
      id: 'cost-by-operation',
      title: 'Cost by Operation Type',
      type: 'toplist',
      query: `sum:llm.estimated_cost_usd{env:$env} by {llm.operation_type}`,
      layout: { x: 6, y: 11, width: 3, height: 3 },
    },
    {
      id: 'cost-by-workspace',
      title: 'Cost by Workspace (Top 10)',
      type: 'toplist',
      query: `top(sum:llm.estimated_cost_usd{env:$env} by {workspace.id}, 10, "sum", "desc")`,
      layout: { x: 9, y: 11, width: 3, height: 3 },
    },

    // === TOKEN USAGE SECTION ===
    {
      id: 'tokens-timeline',
      title: 'Token Usage Over Time',
      type: 'timeseries',
      query: `
        sum:llm.input_tokens{env:$env,llm.provider:$provider}.as_count(),
        sum:llm.output_tokens{env:$env,llm.provider:$provider}.as_count()
      `,
      display: {
        showLegend: true,
      },
      layout: { x: 0, y: 14, width: 6, height: 3 },
    },
    {
      id: 'tokens-efficiency',
      title: 'Token Efficiency (Output/Input Ratio)',
      type: 'timeseries',
      query: `sum:llm.output_tokens{env:$env} / sum:llm.input_tokens{env:$env}`,
      layout: { x: 6, y: 14, width: 3, height: 3 },
    },
    {
      id: 'tokens-by-model',
      title: 'Token Usage by Model',
      type: 'toplist',
      query: `sum:llm.total_tokens{env:$env} by {llm.model}.as_count()`,
      layout: { x: 9, y: 14, width: 3, height: 3 },
    },

    // === MODEL PERFORMANCE SECTION ===
    {
      id: 'model-success-rate',
      title: 'Model Success Rate',
      type: 'timeseries',
      query: `
        (sum:llm.requests.success{env:$env,llm.provider:$provider} by {llm.model}.as_count() /
         sum:llm.requests.count{env:$env,llm.provider:$provider} by {llm.model}.as_count()) * 100
      `,
      display: {
        showLegend: true,
        palette: 'green',
      },
      layout: { x: 0, y: 17, width: 4, height: 3 },
    },
    {
      id: 'model-fallback-rate',
      title: 'Model Fallback Rate',
      type: 'timeseries',
      query: `
        (sum:llm.fallback_used{env:$env}.as_count() /
         sum:llm.requests.count{env:$env}.as_count()) * 100
      `,
      display: {
        palette: 'yellow',
      },
      layout: { x: 4, y: 17, width: 4, height: 3 },
    },
    {
      id: 'model-confidence',
      title: 'Average Confidence Score by Operation',
      type: 'timeseries',
      query: `avg:llm.confidence_score{env:$env,llm.operation_type:$operation} by {llm.operation_type}`,
      layout: { x: 8, y: 17, width: 4, height: 3 },
    },

    // === DOCUMENT PROCESSING SECTION ===
    {
      id: 'extraction-volume',
      title: 'Document Extractions',
      type: 'timeseries',
      query: `sum:llm.requests.count{env:$env,llm.operation_type:document_extraction} by {document.type}.as_count()`,
      display: {
        showLegend: true,
      },
      layout: { x: 0, y: 20, width: 4, height: 3 },
    },
    {
      id: 'categorization-volume',
      title: 'Transaction Categorizations',
      type: 'timeseries',
      query: `sum:llm.requests.count{env:$env,llm.operation_type:transaction_categorization}.as_count()`,
      layout: { x: 4, y: 20, width: 4, height: 3 },
    },
    {
      id: 'csv-normalizations',
      title: 'CSV Header Normalizations',
      type: 'timeseries',
      query: `sum:llm.requests.count{env:$env,llm.operation_type:csv_header_normalization}.as_count()`,
      layout: { x: 8, y: 20, width: 4, height: 3 },
    },

    // === SECURITY SIGNALS SECTION ===
    {
      id: 'security-signals',
      title: 'Security Signals',
      type: 'alert_graph',
      query: `security_signals("service:moneio").rollup("count").by("rule.name").last("24h")`,
      layout: { x: 0, y: 23, width: 6, height: 3 },
    },
    {
      id: 'content-filtering',
      title: 'Content Filtering Events',
      type: 'timeseries',
      query: `sum:llm.content_filtered{env:$env}.as_count()`,
      display: {
        palette: 'purple',
      },
      layout: { x: 6, y: 23, width: 3, height: 3 },
    },
    {
      id: 'pii-detections',
      title: 'PII Detection Events',
      type: 'timeseries',
      query: `sum:llm.security.pii_detected{env:$env}.as_count()`,
      display: {
        palette: 'red',
      },
      layout: { x: 9, y: 23, width: 3, height: 3 },
    },

    // === ALERTS SECTION ===
    {
      id: 'active-alerts',
      title: 'Active Detection Rule Alerts',
      type: 'alert_graph',
      query: `alerts("service:moneio source:llm-observability").rollup("count").by("rule_id").last("1h")`,
      layout: { x: 0, y: 26, width: 12, height: 3 },
    },
  ],
};

/**
 * Cost Analysis Dashboard
 */
export const COST_ANALYSIS_DASHBOARD: DashboardConfig = {
  title: 'LLM Cost Analysis - Moneio',
  description: 'Detailed cost breakdown and optimization insights for LLM operations',
  layoutType: 'ordered',
  templateVariables: [
    {
      name: 'env',
      prefix: 'env',
      defaultValue: 'production',
    },
    {
      name: 'timeframe',
      prefix: 'timeframe',
      defaultValue: '7d',
    },
  ],
  widgets: [
    {
      id: 'cost-total',
      title: 'Total Cost (Selected Period)',
      type: 'query_value',
      query: `sum:llm.estimated_cost_usd{env:$env}`,
      display: {
        palette: 'orange',
      },
      layout: { x: 0, y: 0, width: 3, height: 2 },
    },
    {
      id: 'cost-per-request',
      title: 'Average Cost per Request',
      type: 'query_value',
      query: `sum:llm.estimated_cost_usd{env:$env} / sum:llm.requests.count{env:$env}.as_count()`,
      layout: { x: 3, y: 0, width: 3, height: 2 },
    },
    {
      id: 'cost-trend',
      title: 'Cost Trend (vs Previous Period)',
      type: 'query_value',
      query: `
        ((sum:llm.estimated_cost_usd{env:$env}.rollup(sum, 86400) -
          sum:llm.estimated_cost_usd{env:$env}.rollup(sum, 86400).timeshift(7d)) /
         sum:llm.estimated_cost_usd{env:$env}.rollup(sum, 86400).timeshift(7d)) * 100
      `,
      layout: { x: 6, y: 0, width: 3, height: 2 },
    },
    {
      id: 'cost-projection',
      title: 'Monthly Cost Projection',
      type: 'query_value',
      query: `sum:llm.estimated_cost_usd{env:$env}.rollup(sum, 86400) * 30`,
      layout: { x: 9, y: 0, width: 3, height: 2 },
    },
    {
      id: 'cost-by-model-detailed',
      title: 'Cost Breakdown by Model',
      type: 'timeseries',
      query: `sum:llm.estimated_cost_usd{env:$env} by {llm.model}`,
      display: {
        showLegend: true,
      },
      layout: { x: 0, y: 2, width: 6, height: 4 },
    },
    {
      id: 'cost-by-operation-detailed',
      title: 'Cost Breakdown by Operation',
      type: 'timeseries',
      query: `sum:llm.estimated_cost_usd{env:$env} by {llm.operation_type}`,
      display: {
        showLegend: true,
      },
      layout: { x: 6, y: 2, width: 6, height: 4 },
    },
    {
      id: 'token-cost-efficiency',
      title: 'Cost per 1K Tokens (by Model)',
      type: 'toplist',
      query: `(sum:llm.estimated_cost_usd{env:$env} by {llm.model} / sum:llm.total_tokens{env:$env} by {llm.model}) * 1000`,
      layout: { x: 0, y: 6, width: 4, height: 3 },
    },
    {
      id: 'expensive-operations',
      title: 'Most Expensive Operations (Top 10)',
      type: 'toplist',
      query: `top(sum:llm.estimated_cost_usd{env:$env} by {llm.operation_type,llm.model}, 10, "sum", "desc")`,
      layout: { x: 4, y: 6, width: 4, height: 3 },
    },
    {
      id: 'cost-by-workspace-detailed',
      title: 'Cost by Workspace',
      type: 'toplist',
      query: `top(sum:llm.estimated_cost_usd{env:$env} by {workspace.id}, 20, "sum", "desc")`,
      layout: { x: 8, y: 6, width: 4, height: 3 },
    },
  ],
};

/**
 * Export dashboard as Datadog JSON format
 */
export function exportDashboardAsJson(config: DashboardConfig): string {
  return JSON.stringify(
    {
      title: config.title,
      description: config.description,
      layout_type: config.layoutType,
      template_variables: config.templateVariables?.map((v) => ({
        name: v.name,
        prefix: v.prefix,
        default: v.defaultValue,
      })),
      widgets: config.widgets.map((widget) => ({
        id: widget.id,
        definition: {
          title: widget.title,
          type: widget.type,
          requests: [
            {
              q: widget.query,
              display_type: widget.type === 'timeseries' ? 'line' : undefined,
            },
          ],
          ...widget.display,
        },
        layout: widget.layout,
      })),
    },
    null,
    2
  );
}

/**
 * Get all dashboard configurations
 */
export function getAllDashboards(): DashboardConfig[] {
  return [LLM_OBSERVABILITY_DASHBOARD, COST_ANALYSIS_DASHBOARD];
}
