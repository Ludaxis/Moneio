/**
 * Detection Rules Configuration
 *
 * Defines anomaly detection and alerting rules for LLM operations.
 * These rules are designed to be exported to Datadog's Detection Rules.
 */

import type { DetectionRule } from '../types';

/**
 * Pre-configured detection rules for LLM observability
 */
export const LLM_DETECTION_RULES: DetectionRule[] = [
  // === ERROR RATE RULES ===
  {
    id: 'llm-high-error-rate',
    name: 'LLM High Error Rate',
    description:
      'Triggers when LLM call error rate exceeds threshold, indicating potential API issues or model problems',
    type: 'error_rate',
    enabled: true,
    severity: 'high',
    metric: 'llm.requests.error_rate',
    threshold: {
      operator: 'gt',
      value: 0.1, // 10% error rate
      recoveryValue: 0.05,
    },
    timeWindow: '5m',
    filterTags: {
      service: 'moneio',
    },
    action: {
      type: 'incident',
      priority: 'P2',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## LLM Error Rate Alert

**Error Rate**: {{value}}%
**Time Window**: {{timeWindow}}
**Provider**: {{llm.provider}}
**Model**: {{llm.model}}

### Recommended Actions
1. Check LLM provider status page
2. Review recent model configuration changes
3. Check API key validity and quotas
4. Review error logs for specific failure patterns

### Useful Links
- [LLM Dashboard](#/dashboard/llm-observability)
- [Error Logs](#/logs?query=service:moneio%20llm.success:false)
`,
    },
  },

  {
    id: 'llm-critical-error-rate',
    name: 'LLM Critical Error Rate',
    description: 'Critical alert when LLM error rate exceeds 50%',
    type: 'error_rate',
    enabled: true,
    severity: 'critical',
    metric: 'llm.requests.error_rate',
    threshold: {
      operator: 'gt',
      value: 0.5, // 50% error rate
      recoveryValue: 0.25,
    },
    timeWindow: '5m',
    action: {
      type: 'incident',
      priority: 'P1',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## CRITICAL: LLM Service Degradation

**Error Rate**: {{value}}%
**Impact**: Document processing and categorization severely impacted

### Immediate Actions Required
1. Enable fallback models if not already active
2. Check LLM provider status for outages
3. Consider rate limiting to preserve quota
4. Notify affected teams about potential delays
`,
    },
  },

  // === LATENCY RULES ===
  {
    id: 'llm-high-latency',
    name: 'LLM High Latency',
    description: 'Triggers when LLM response time exceeds acceptable threshold',
    type: 'latency',
    enabled: true,
    severity: 'medium',
    metric: 'llm.completion_time_ms',
    threshold: {
      operator: 'gt',
      value: 10000, // 10 seconds
      recoveryValue: 5000,
    },
    timeWindow: '5m',
    action: {
      type: 'alert',
      priority: 'P3',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## LLM Latency Alert

**P95 Latency**: {{value}}ms
**Model**: {{llm.model}}
**Operation**: {{llm.operation_type}}

### Investigation Steps
1. Check if specific operations are affected
2. Review prompt complexity/length
3. Check provider rate limits
4. Consider model downgrade for faster responses
`,
    },
  },

  {
    id: 'llm-extreme-latency',
    name: 'LLM Extreme Latency',
    description: 'Critical latency alert - responses taking too long',
    type: 'latency',
    enabled: true,
    severity: 'high',
    metric: 'llm.completion_time_ms.p99',
    threshold: {
      operator: 'gt',
      value: 30000, // 30 seconds
      recoveryValue: 15000,
    },
    timeWindow: '5m',
    action: {
      type: 'incident',
      priority: 'P2',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## SEVERE: LLM Response Time Critical

**P99 Latency**: {{value}}ms
**Impact**: User experience severely degraded, potential timeouts

### Immediate Actions
1. Check for provider degradation
2. Implement timeout handling
3. Switch to faster model variant
4. Queue non-critical operations
`,
    },
  },

  // === COST RULES ===
  {
    id: 'llm-cost-spike',
    name: 'LLM Cost Spike',
    description: 'Detects unusual increase in LLM costs',
    type: 'cost_spike',
    enabled: true,
    severity: 'medium',
    metric: 'llm.estimated_cost_usd',
    threshold: {
      operator: 'gt',
      value: 50, // $50/hour
      anomalyPercentage: 200, // 200% of baseline
    },
    timeWindow: '1h',
    action: {
      type: 'alert',
      priority: 'P3',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## LLM Cost Spike Detected

**Current Hourly Cost**: \${{value}}
**Baseline**: \${{baseline}}
**Increase**: {{increase}}%

### Analysis Required
1. Review token usage by operation type
2. Check for unexpected batch processing
3. Verify prompt efficiency
4. Review model selection logic

### Cost Breakdown
- Provider: {{llm.provider}}
- Top Operations: {{topOperations}}
`,
    },
  },

  {
    id: 'llm-daily-cost-threshold',
    name: 'LLM Daily Cost Threshold',
    description: 'Alert when daily LLM costs approach budget limit',
    type: 'threshold',
    enabled: true,
    severity: 'high',
    metric: 'llm.daily_cost_usd',
    threshold: {
      operator: 'gt',
      value: 500, // $500/day
      recoveryValue: 400,
    },
    timeWindow: '1d',
    action: {
      type: 'case',
      priority: 'P2',
      notifyTeam: 'engineering-leads',
      contextTemplate: `
## Daily LLM Cost Threshold Reached

**Daily Cost**: \${{value}}
**Budget Limit**: $500

### Review Required
- Verify if cost is justified by usage increase
- Consider implementing cost controls
- Review expensive operations for optimization
`,
    },
  },

  // === TOKEN USAGE RULES ===
  {
    id: 'llm-token-anomaly',
    name: 'LLM Token Usage Anomaly',
    description: 'Detects unusual token consumption patterns',
    type: 'anomaly',
    enabled: true,
    severity: 'medium',
    metric: 'llm.total_tokens',
    threshold: {
      operator: 'gt',
      value: 0,
      anomalyPercentage: 300, // 3x normal usage
    },
    timeWindow: '15m',
    action: {
      type: 'alert',
      priority: 'P4',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## Token Usage Anomaly

**Current Usage**: {{value}} tokens
**Expected**: {{expected}} tokens
**Variance**: {{variance}}%

### Potential Causes
- Large document batch processing
- Verbose prompt configurations
- Retry loops with full prompts
- Inefficient chunking strategies
`,
    },
  },

  // === RATE LIMIT RULES ===
  {
    id: 'llm-rate-limit-approaching',
    name: 'LLM Rate Limit Approaching',
    description: 'Warns when approaching LLM provider rate limits',
    type: 'rate_limit',
    enabled: true,
    severity: 'medium',
    metric: 'llm.requests.rate',
    threshold: {
      operator: 'gt',
      value: 50, // 50 requests per minute
      recoveryValue: 30,
    },
    timeWindow: '1m',
    action: {
      type: 'alert',
      priority: 'P3',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## Rate Limit Warning

**Current Rate**: {{value}} req/min
**Limit**: Approaching provider limits

### Preventive Actions
1. Implement request queuing
2. Enable request coalescing
3. Increase batch sizes
4. Consider rate limit tier upgrade
`,
    },
  },

  {
    id: 'llm-rate-limit-exceeded',
    name: 'LLM Rate Limit Exceeded',
    description: 'Triggers when rate limit errors are detected',
    type: 'error_rate',
    enabled: true,
    severity: 'high',
    metric: 'llm.errors.rate_limit',
    threshold: {
      operator: 'gt',
      value: 1, // Any rate limit error
    },
    timeWindow: '5m',
    filterTags: {
      'error.type': 'RateLimitError',
    },
    action: {
      type: 'incident',
      priority: 'P2',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## Rate Limit Exceeded

**Rate Limit Errors**: {{value}}
**Provider**: {{llm.provider}}

### Immediate Actions
1. Enable exponential backoff
2. Reduce concurrent requests
3. Queue non-urgent operations
4. Contact provider for limit increase
`,
    },
  },

  // === SECURITY RULES ===
  {
    id: 'llm-prompt-injection-attempt',
    name: 'Prompt Injection Attempt Detected',
    description: 'Detects potential prompt injection attacks in user inputs',
    type: 'security',
    enabled: true,
    severity: 'critical',
    metric: 'llm.security.prompt_injection',
    threshold: {
      operator: 'gt',
      value: 0,
    },
    timeWindow: '1m',
    action: {
      type: 'incident',
      priority: 'P1',
      notifyTeam: 'security',
      contextTemplate: `
## SECURITY: Prompt Injection Attempt

**Detection Time**: {{timestamp}}
**User ID**: {{user.id}}
**Workspace**: {{workspace.id}}
**Document ID**: {{document.id}}

### Immediate Actions
1. Review the flagged content
2. Check user activity history
3. Consider temporary access restriction
4. Document for security review

### Detection Details
- Pattern matched: {{pattern}}
- Input hash: {{input_hash}}
`,
    },
  },

  {
    id: 'llm-pii-exposure',
    name: 'PII Exposure in LLM Response',
    description: 'Detects potential PII in LLM responses',
    type: 'security',
    enabled: true,
    severity: 'high',
    metric: 'llm.security.pii_detected',
    threshold: {
      operator: 'gt',
      value: 0,
    },
    timeWindow: '5m',
    action: {
      type: 'case',
      priority: 'P2',
      notifyTeam: 'security',
      contextTemplate: `
## PII Detection Alert

**PII Type**: {{pii_type}}
**Operation**: {{llm.operation_type}}

### Required Actions
1. Review response content
2. Verify data handling compliance
3. Update PII filtering rules if needed
4. Document incident for compliance
`,
    },
  },

  // === MODEL PERFORMANCE RULES ===
  {
    id: 'llm-model-fallback-rate',
    name: 'LLM Model Fallback Rate High',
    description: 'Primary model failing frequently, relying on fallback',
    type: 'threshold',
    enabled: true,
    severity: 'medium',
    metric: 'llm.fallback_used.rate',
    threshold: {
      operator: 'gt',
      value: 0.2, // 20% fallback rate
      recoveryValue: 0.1,
    },
    timeWindow: '15m',
    action: {
      type: 'alert',
      priority: 'P3',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## High Model Fallback Rate

**Fallback Rate**: {{value}}%
**Primary Model**: {{llm.original_model}}
**Fallback Model**: {{llm.model}}

### Investigation
1. Check primary model availability
2. Review error patterns for primary model
3. Assess fallback model quality
4. Consider switching default model
`,
    },
  },

  {
    id: 'llm-low-confidence',
    name: 'LLM Low Confidence Responses',
    description: 'High rate of low-confidence extractions',
    type: 'threshold',
    enabled: true,
    severity: 'low',
    metric: 'llm.confidence_score.avg',
    threshold: {
      operator: 'lt',
      value: 60, // Below 60% average confidence
      recoveryValue: 70,
    },
    timeWindow: '1h',
    filterTags: {
      'llm.operation_type': 'document_extraction',
    },
    action: {
      type: 'alert',
      priority: 'P4',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## Low Extraction Confidence

**Average Confidence**: {{value}}%
**Document Types Affected**: {{document_types}}

### Analysis
1. Review document quality
2. Check for new document formats
3. Evaluate prompt effectiveness
4. Consider retraining or prompt tuning
`,
    },
  },

  // === AVAILABILITY RULES ===
  {
    id: 'llm-service-unavailable',
    name: 'LLM Service Unavailable',
    description: 'No successful LLM calls for extended period',
    type: 'threshold',
    enabled: true,
    severity: 'critical',
    metric: 'llm.requests.success.count',
    threshold: {
      operator: 'lt',
      value: 1, // No successful calls
    },
    timeWindow: '10m',
    action: {
      type: 'incident',
      priority: 'P1',
      notifyTeam: 'ai-platform',
      contextTemplate: `
## CRITICAL: LLM Service Down

**Last Successful Call**: {{last_success}}
**Duration**: {{duration}}

### Immediate Actions
1. Check all LLM provider status pages
2. Verify API credentials
3. Check network connectivity
4. Enable manual processing fallback
5. Notify support channels

### Impact
- Document processing: BLOCKED
- Transaction categorization: BLOCKED
- CSV import: BLOCKED
`,
    },
  },
];

/**
 * Get detection rules by severity
 */
export function getRulesBySeverity(
  severity: 'low' | 'medium' | 'high' | 'critical'
): DetectionRule[] {
  return LLM_DETECTION_RULES.filter((rule) => rule.severity === severity);
}

/**
 * Get detection rules by type
 */
export function getRulesByType(type: DetectionRule['type']): DetectionRule[] {
  return LLM_DETECTION_RULES.filter((rule) => rule.type === type);
}

/**
 * Get enabled detection rules
 */
export function getEnabledRules(): DetectionRule[] {
  return LLM_DETECTION_RULES.filter((rule) => rule.enabled);
}

/**
 * Export rules as Datadog Detection Rules YAML format
 */
export function exportAsDatadogRules(): string {
  const rules = getEnabledRules();

  const yaml = rules.map((rule) => {
    return `
# ${rule.name}
# ${rule.description}
- name: "${rule.name}"
  type: ${rule.type === 'threshold' ? 'query alert' : 'log detection'}
  query: |
    avg(last_${rule.timeWindow}):${rule.metric}{service:moneio} ${rule.threshold.operator === 'gt' ? '>' : '<'} ${rule.threshold.value}
  message: |
    ${rule.action.contextTemplate?.replace(/\n/g, '\n    ') || rule.description}

    @${rule.action.notifyTeam || 'slack-ai-alerts'}
  tags:
    - "severity:${rule.severity}"
    - "service:moneio"
    - "team:ai-platform"
  priority: ${rule.action.priority || 'P3'}
  options:
    notify_no_data: false
    require_full_window: true
`;
  });

  return yaml.join('\n---\n');
}
