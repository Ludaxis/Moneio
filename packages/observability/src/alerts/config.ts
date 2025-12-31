/**
 * Alert Configuration
 *
 * Defines Datadog alert monitors for LLM observability.
 */

import type { AlertConfig } from '../types';

/**
 * Pre-configured alert monitors for LLM operations
 */
export const LLM_ALERT_CONFIGS: AlertConfig[] = [
  // === CRITICAL ALERTS ===
  {
    name: '[LLM] Critical: Service Unavailable',
    type: 'metric',
    query: `sum(last_10m):sum:llm.requests.success{service:moneio}.as_count() < 1`,
    message: `
## LLM Service Unavailable

No successful LLM calls in the last 10 minutes.

### Impact
- Document processing: **BLOCKED**
- Transaction categorization: **BLOCKED**
- CSV header detection: **BLOCKED**

### Immediate Actions
1. Check LLM provider status pages:
   - [Google AI Studio Status](https://status.cloud.google.com/)
   - [OpenAI Status](https://status.openai.com/)
2. Verify API credentials in environment variables
3. Check network connectivity from worker nodes
4. Review recent deployments for configuration changes

### Escalation
@slack-critical-alerts @pagerduty-ai-oncall

---
{{#is_alert}}
**Alert triggered at:** {{triggered_at}}
{{/is_alert}}
{{#is_recovery}}
**Recovered at:** {{recovered_at}}
**Duration:** {{duration}}
{{/is_recovery}}
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:critical'],
    priority: 1,
    notifyTargets: ['@slack-critical-alerts', '@pagerduty-ai-oncall'],
    thresholds: {
      critical: 1,
    },
    evaluationWindow: '10m',
    recovery: {
      enabled: true,
      duration: '5m',
    },
  },

  {
    name: '[LLM] Critical: Error Rate > 50%',
    type: 'metric',
    query: `avg(last_5m):( sum:llm.requests.error{service:moneio}.as_count() / sum:llm.requests.count{service:moneio}.as_count() ) * 100 > 50`,
    message: `
## Critical LLM Error Rate

Error rate has exceeded 50% in the last 5 minutes.

**Current Error Rate:** {{value}}%

### Impact Assessment
- More than half of LLM requests are failing
- User-facing features severely degraded
- Document queue likely backing up

### Immediate Actions
1. Enable emergency fallback models
2. Check provider quotas and rate limits
3. Review error logs for specific failure patterns
4. Consider pausing non-critical LLM operations

### Recent Errors
Check logs: \`service:moneio llm.success:false -5m\`

@slack-critical-alerts @pagerduty-ai-oncall
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:critical'],
    priority: 1,
    notifyTargets: ['@slack-critical-alerts', '@pagerduty-ai-oncall'],
    thresholds: {
      critical: 50,
      warning: 25,
    },
    evaluationWindow: '5m',
    recovery: {
      enabled: true,
      duration: '5m',
    },
  },

  // === HIGH SEVERITY ALERTS ===
  {
    name: '[LLM] High: Latency P99 > 30s',
    type: 'metric',
    query: `avg(last_5m):percentile:llm.completion_time_ms{service:moneio} p:99 > 30000`,
    message: `
## High LLM Latency Alert

P99 latency has exceeded 30 seconds.

**Current P99 Latency:** {{value}}ms

### Impact
- Users experiencing long wait times
- Potential request timeouts
- Worker job queue may be growing

### Investigation Steps
1. Check which models/operations are affected
2. Review recent prompt changes
3. Check for provider-side degradation
4. Consider switching to faster model

### Metrics to Review
- Request volume: Is there a spike?
- Token counts: Are prompts getting longer?
- Error rates: Are retries causing delays?

@slack-ai-alerts
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:high'],
    priority: 2,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {
      critical: 30000,
      warning: 15000,
    },
    evaluationWindow: '5m',
    recovery: {
      enabled: true,
      duration: '10m',
    },
  },

  {
    name: '[LLM] High: Error Rate > 10%',
    type: 'metric',
    query: `avg(last_5m):( sum:llm.requests.error{service:moneio}.as_count() / sum:llm.requests.count{service:moneio}.as_count() ) * 100 > 10`,
    message: `
## Elevated LLM Error Rate

Error rate has exceeded 10% threshold.

**Current Error Rate:** {{value}}%

### Possible Causes
- API rate limiting
- Invalid request formats
- Model availability issues
- Network problems

### Actions
1. Review error distribution by type
2. Check rate limit headers
3. Verify model configurations
4. Monitor for escalation

@slack-ai-alerts
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:high'],
    priority: 2,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {
      critical: 10,
      warning: 5,
    },
    evaluationWindow: '5m',
    recovery: {
      enabled: true,
      duration: '10m',
    },
  },

  {
    name: '[LLM] High: Rate Limit Errors Detected',
    type: 'log',
    query: `logs("service:moneio error.type:RateLimitError OR error.type:429").index("*").rollup("count").by("llm.provider").last("5m") > 5`,
    message: `
## Rate Limit Errors Detected

Multiple rate limit errors from LLM provider.

**Provider:** {{llm.provider}}
**Error Count:** {{value}}

### Immediate Actions
1. Reduce concurrent request rate
2. Implement exponential backoff
3. Check current quota usage
4. Queue non-urgent operations

### Long-term Solutions
- Request quota increase from provider
- Implement request coalescing
- Add caching layer for common prompts

@slack-ai-alerts
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:high'],
    priority: 2,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {
      critical: 5,
    },
    evaluationWindow: '5m',
  },

  // === MEDIUM SEVERITY ALERTS ===
  {
    name: '[LLM] Medium: Cost Spike Detected',
    type: 'metric',
    query: `pct_change(sum(last_1h),sum(last_1h,offset 1h)):sum:llm.estimated_cost_usd{service:moneio} > 200`,
    message: `
## LLM Cost Spike Alert

Hourly LLM costs have increased by more than 200% compared to previous hour.

**Current Hourly Cost:** \${{value}}
**Increase:** {{pct_change}}%

### Investigation
1. Check for batch processing jobs
2. Review token usage by operation
3. Verify prompt efficiency
4. Check for retry loops

### Cost Breakdown
Review cost dashboard for detailed analysis.

@slack-ai-alerts @finance-team
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:medium'],
    priority: 3,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {
      warning: 200,
    },
    evaluationWindow: '1h',
  },

  {
    name: '[LLM] Medium: Daily Cost Threshold',
    type: 'metric',
    query: `sum(last_1d):sum:llm.estimated_cost_usd{service:moneio} > 500`,
    message: `
## Daily LLM Cost Threshold Reached

Daily LLM spending has exceeded $500.

**Current Daily Cost:** \${{value}}

### Review Required
- Verify cost is justified by usage
- Check for inefficient operations
- Review model selection

@slack-ai-alerts @finance-team
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:medium'],
    priority: 3,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {
      warning: 500,
      critical: 1000,
    },
    evaluationWindow: '1d',
  },

  {
    name: '[LLM] Medium: High Model Fallback Rate',
    type: 'metric',
    query: `avg(last_15m):( sum:llm.fallback_used{service:moneio}.as_count() / sum:llm.requests.count{service:moneio}.as_count() ) * 100 > 20`,
    message: `
## High Model Fallback Rate

Primary model failing frequently, relying on fallback.

**Fallback Rate:** {{value}}%

### Investigation
1. Check primary model (gemini-2.0-flash) status
2. Review error patterns from primary model
3. Assess fallback model (gemini-1.5-flash) performance

@slack-ai-alerts
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:medium'],
    priority: 3,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {
      warning: 20,
      critical: 50,
    },
    evaluationWindow: '15m',
    recovery: {
      enabled: true,
      duration: '15m',
    },
  },

  // === LOW SEVERITY ALERTS ===
  {
    name: '[LLM] Low: P95 Latency > 10s',
    type: 'metric',
    query: `avg(last_10m):percentile:llm.completion_time_ms{service:moneio} p:95 > 10000`,
    message: `
## Elevated LLM Latency

P95 latency is above normal threshold.

**Current P95 Latency:** {{value}}ms

### Possible Causes
- High request volume
- Complex document processing
- Provider slowdown

@slack-ai-alerts
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:low'],
    priority: 4,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {
      warning: 10000,
    },
    evaluationWindow: '10m',
    recovery: {
      enabled: true,
      duration: '10m',
    },
  },

  {
    name: '[LLM] Low: Token Usage Anomaly',
    type: 'metric',
    query: `anomalies(sum:llm.total_tokens{service:moneio}.as_count(), "basic", 3) >= 1`,
    message: `
## Token Usage Anomaly Detected

Token consumption is significantly different from baseline.

### Possible Causes
- Large document batch processing
- Changed prompt templates
- New feature rollout

This is informational - review if unexpected.

@slack-ai-alerts
`,
    tags: ['service:moneio', 'team:ai-platform', 'severity:low'],
    priority: 5,
    notifyTargets: ['@slack-ai-alerts'],
    thresholds: {},
    evaluationWindow: '1h',
  },

  // === SECURITY ALERTS ===
  {
    name: '[LLM Security] Prompt Injection Attempt',
    type: 'log',
    query: `logs("service:moneio llm.security.prompt_injection:true").index("*").rollup("count").last("5m") >= 1`,
    message: `
## SECURITY: Prompt Injection Attempt Detected

A potential prompt injection attack has been detected.

### Immediate Actions
1. Review the flagged content
2. Check user activity history
3. Consider temporary access restriction
4. Document for security review

### Detection Details
Check security logs for full context.

@security-team @slack-security-alerts
`,
    tags: ['service:moneio', 'team:security', 'severity:critical'],
    priority: 1,
    notifyTargets: ['@security-team', '@slack-security-alerts'],
    thresholds: {
      critical: 1,
    },
    evaluationWindow: '5m',
  },

  {
    name: '[LLM Security] PII in Response',
    type: 'log',
    query: `logs("service:moneio llm.security.pii_detected:true").index("*").rollup("count").last("15m") >= 1`,
    message: `
## SECURITY: PII Detected in LLM Response

Potential personally identifiable information detected in LLM output.

### Required Actions
1. Review the flagged response
2. Verify data handling compliance
3. Update PII filtering if needed
4. Document for compliance

@security-team @compliance-team
`,
    tags: ['service:moneio', 'team:security', 'severity:high'],
    priority: 2,
    notifyTargets: ['@security-team'],
    thresholds: {
      critical: 1,
    },
    evaluationWindow: '15m',
  },
];

/**
 * Export alerts as Datadog monitor JSON format
 */
export function exportAlertsAsJson(): string {
  return JSON.stringify(
    LLM_ALERT_CONFIGS.map((alert) => ({
      name: alert.name,
      type: alert.type === 'log' ? 'log alert' : 'query alert',
      query: alert.query,
      message: alert.message,
      tags: alert.tags,
      priority: alert.priority,
      options: {
        thresholds: alert.thresholds,
        notify_no_data: false,
        require_full_window: true,
        include_tags: true,
        new_host_delay: 300,
        evaluation_delay: alert.type === 'log' ? 60 : undefined,
        renotify_interval: 60,
        escalation_message: '',
        notify_audit: false,
      },
    })),
    null,
    2
  );
}

/**
 * Get alerts by severity
 */
export function getAlertsBySeverity(severity: string): AlertConfig[] {
  return LLM_ALERT_CONFIGS.filter((alert) => alert.tags.includes(`severity:${severity}`));
}

/**
 * Get security-related alerts
 */
export function getSecurityAlerts(): AlertConfig[] {
  return LLM_ALERT_CONFIGS.filter(
    (alert) => alert.tags.includes('team:security') || alert.name.includes('Security')
  );
}
