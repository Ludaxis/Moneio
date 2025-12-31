/**
 * Detection Rule Evaluator
 *
 * Evaluates LLM metrics against detection rules and triggers actions.
 */

import type { AggregatedMetrics, LlmMetricsCollector } from '../llm/metrics';
import type { DetectionRule, DetectionAction } from '../types';

import { LLM_DETECTION_RULES } from './rules';

/**
 * Evaluation result for a single rule
 */
export interface RuleEvaluationResult {
  rule: DetectionRule;
  triggered: boolean;
  currentValue: number;
  threshold: number;
  severity: string;
  timestamp: number;
  context: Record<string, unknown>;
}

/**
 * Action to be executed when rule triggers
 */
export interface TriggeredAction {
  ruleId: string;
  ruleName: string;
  action: DetectionAction;
  context: Record<string, unknown>;
  timestamp: number;
}

/**
 * Detection Rule Evaluator
 *
 * Continuously evaluates metrics against rules and triggers actions.
 */
export class DetectionRuleEvaluator {
  private readonly rules: DetectionRule[];
  private readonly metricsCollector: LlmMetricsCollector;
  private readonly actionHandler: (action: TriggeredAction) => Promise<void>;
  private evaluationInterval: ReturnType<typeof setInterval> | null = null;
  private ruleStates: Map<string, RuleState> = new Map();

  constructor(options: {
    metricsCollector: LlmMetricsCollector;
    actionHandler: (action: TriggeredAction) => Promise<void>;
    rules?: DetectionRule[];
  }) {
    this.metricsCollector = options.metricsCollector;
    this.actionHandler = options.actionHandler;
    this.rules = options.rules || LLM_DETECTION_RULES.filter((r) => r.enabled);

    // Initialize rule states
    for (const rule of this.rules) {
      this.ruleStates.set(rule.id, {
        triggered: false,
        lastTriggered: null,
        consecutiveTriggered: 0,
      });
    }
  }

  /**
   * Start periodic evaluation
   */
  start(intervalMs: number = 60000): void {
    if (this.evaluationInterval) {
      this.stop();
    }

    this.evaluationInterval = setInterval(() => {
      this.evaluateAllRules().catch((err) => {
        console.error('[DetectionEvaluator] Evaluation error:', err);
      });
    }, intervalMs);

    // Skip initial evaluation at startup - wait for first interval
    // This prevents false positives when there's no LLM activity yet
    console.log('[DetectionEvaluator] Started - first evaluation in', intervalMs, 'ms');
  }

  /**
   * Stop periodic evaluation
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
  }

  /**
   * Evaluate all rules against current metrics
   */
  async evaluateAllRules(): Promise<RuleEvaluationResult[]> {
    const metrics = this.metricsCollector.getAggregatedMetrics();
    const results: RuleEvaluationResult[] = [];

    // Skip evaluation when there's no LLM activity yet
    // This prevents false positives at startup
    if (metrics.totalCalls === 0) {
      console.log('[DetectionEvaluator] Skipping evaluation - no LLM calls recorded yet');
      return results;
    }

    for (const rule of this.rules) {
      const result = this.evaluateRule(rule, metrics);
      results.push(result);

      // Handle triggered rules
      if (result.triggered) {
        const state = this.ruleStates.get(rule.id)!;

        // Only trigger action if this is a new trigger (not already triggered)
        if (!state.triggered) {
          state.triggered = true;
          state.lastTriggered = Date.now();
          state.consecutiveTriggered = 1;

          await this.triggerAction(rule, result);
        } else {
          state.consecutiveTriggered++;
        }
      } else {
        // Check for recovery
        const state = this.ruleStates.get(rule.id)!;
        if (state.triggered && rule.threshold.recoveryValue !== undefined) {
          if (this.checkRecovery(rule, result.currentValue)) {
            state.triggered = false;
            state.consecutiveTriggered = 0;

            // Log recovery
            console.log(
              JSON.stringify({
                message: 'detection.rule.recovered',
                rule_id: rule.id,
                rule_name: rule.name,
                current_value: result.currentValue,
                recovery_threshold: rule.threshold.recoveryValue,
              })
            );
          }
        }
      }
    }

    return results;
  }

  /**
   * Evaluate a single rule
   */
  private evaluateRule(rule: DetectionRule, metrics: AggregatedMetrics): RuleEvaluationResult {
    const currentValue = this.getMetricValue(rule.metric, metrics);
    const triggered = this.checkThreshold(rule, currentValue);

    return {
      rule,
      triggered,
      currentValue,
      threshold: rule.threshold.value,
      severity: rule.severity,
      timestamp: Date.now(),
      context: {
        metrics: this.getRelevantMetrics(rule, metrics),
      },
    };
  }

  /**
   * Get metric value from aggregated metrics
   */
  private getMetricValue(metric: string, metrics: AggregatedMetrics): number {
    const metricMap: Record<string, number> = {
      'llm.requests.error_rate': metrics.errorRate,
      'llm.completion_time_ms': metrics.avgDuration,
      'llm.completion_time_ms.p99': metrics.p99Duration,
      'llm.completion_time_ms.p95': metrics.p95Duration,
      'llm.estimated_cost_usd': metrics.totalCost,
      'llm.daily_cost_usd': metrics.totalCost, // Would need daily tracking
      'llm.total_tokens': metrics.totalTokens,
      'llm.requests.rate': metrics.totalCalls, // Per time window
      'llm.requests.success.count': metrics.successfulCalls,
      'llm.confidence_score.avg': 0, // Would need confidence tracking
      'llm.fallback_used.rate': 0, // Would need fallback tracking
      'llm.errors.rate_limit': metrics.failedCalls, // Approximation
      'llm.security.prompt_injection': 0, // Would need security scanning
      'llm.security.pii_detected': 0, // Would need PII scanning
    };

    return metricMap[metric] ?? 0;
  }

  /**
   * Check if metric exceeds threshold
   */
  private checkThreshold(rule: DetectionRule, value: number): boolean {
    const { operator, value: threshold } = rule.threshold;

    switch (operator) {
      case 'gt':
        return value > threshold;
      case 'gte':
        return value >= threshold;
      case 'lt':
        return value < threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
      case 'ne':
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * Check if metric has recovered below recovery threshold
   */
  private checkRecovery(rule: DetectionRule, value: number): boolean {
    const recoveryValue = rule.threshold.recoveryValue;
    if (recoveryValue === undefined) return false;

    const { operator } = rule.threshold;

    // Recovery is the opposite of trigger
    switch (operator) {
      case 'gt':
      case 'gte':
        return value <= recoveryValue;
      case 'lt':
      case 'lte':
        return value >= recoveryValue;
      default:
        return false;
    }
  }

  /**
   * Get relevant metrics for context
   */
  private getRelevantMetrics(
    rule: DetectionRule,
    metrics: AggregatedMetrics
  ): Record<string, unknown> {
    const relevant: Record<string, unknown> = {
      totalCalls: metrics.totalCalls,
      errorRate: metrics.errorRate,
      avgDuration: metrics.avgDuration,
    };

    switch (rule.type) {
      case 'error_rate':
        relevant.failedCalls = metrics.failedCalls;
        relevant.successfulCalls = metrics.successfulCalls;
        break;
      case 'latency':
        relevant.p50Duration = metrics.p50Duration;
        relevant.p95Duration = metrics.p95Duration;
        relevant.p99Duration = metrics.p99Duration;
        break;
      case 'cost_spike':
        relevant.totalCost = metrics.totalCost;
        relevant.totalTokens = metrics.totalTokens;
        break;
    }

    return relevant;
  }

  /**
   * Trigger action for rule
   */
  private async triggerAction(rule: DetectionRule, result: RuleEvaluationResult): Promise<void> {
    const action: TriggeredAction = {
      ruleId: rule.id,
      ruleName: rule.name,
      action: rule.action,
      context: {
        ...result.context,
        value: result.currentValue,
        threshold: result.threshold,
        severity: result.severity,
        timeWindow: rule.timeWindow,
      },
      timestamp: Date.now(),
    };

    // Log the triggered action
    console.log(
      JSON.stringify({
        dd: {
          service: 'moneio',
          env: process.env.NODE_ENV || 'development',
        },
        message: 'detection.rule.triggered',
        level: rule.severity === 'critical' ? 'error' : 'warn',
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        action_type: rule.action.type,
        current_value: result.currentValue,
        threshold: result.threshold,
        context: result.context,
      })
    );

    await this.actionHandler(action);
  }
}

interface RuleState {
  triggered: boolean;
  lastTriggered: number | null;
  consecutiveTriggered: number;
}

/**
 * Create default action handler that logs to Datadog
 */
export function createDatadogActionHandler(): (action: TriggeredAction) => Promise<void> {
  return async (action: TriggeredAction) => {
    const { ruleId, ruleName, action: actionConfig, context, timestamp: _timestamp } = action;

    // Create Datadog event
    const event = {
      title: `[${actionConfig.priority || 'P3'}] ${ruleName}`,
      text: actionConfig.contextTemplate
        ? renderTemplate(actionConfig.contextTemplate, context)
        : `Detection rule "${ruleName}" triggered`,
      alert_type: getAlertType(action),
      priority: actionConfig.priority?.toLowerCase() || 'normal',
      tags: [
        `rule_id:${ruleId}`,
        `action_type:${actionConfig.type}`,
        `severity:${context['severity'] as string}`,
        'service:moneio',
        'source:llm-observability',
      ],
      source_type_name: 'moneio_detection',
    };

    // Log as Datadog event format
    console.log(
      JSON.stringify({
        dd: {
          event,
        },
        message: `detection.action.${actionConfig.type}`,
        level:
          actionConfig.type === 'incident'
            ? 'error'
            : actionConfig.type === 'case'
              ? 'warn'
              : 'info',
        ...event,
      })
    );

    // Handle specific action types
    switch (actionConfig.type) {
      case 'incident':
        await createDatadogIncident(action);
        break;
      case 'case':
        await createDatadogCase(action);
        break;
      case 'webhook':
        // Would call external webhook
        break;
    }
  };
}

function getAlertType(action: TriggeredAction): 'error' | 'warning' | 'info' | 'success' {
  switch (action.action.priority) {
    case 'P1':
    case 'P2':
      return 'error';
    case 'P3':
      return 'warning';
    default:
      return 'info';
  }
}

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = path.split('.').reduce((obj: unknown, key: string) => {
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, context);
    return value !== undefined ? String(value) : `{{${path}}}`;
  });
}

async function createDatadogIncident(action: TriggeredAction): Promise<void> {
  // Log incident creation for Datadog
  console.log(
    JSON.stringify({
      dd: {
        incident: {
          title: `[${action.action.priority}] ${action.ruleName}`,
          severity: action.action.priority === 'P1' ? 'SEV-1' : 'SEV-2',
          commander: action.action.notifyTeam,
          fields: {
            detection_rule: action.ruleId,
            ...action.context,
          },
        },
      },
      message: 'incident.created',
      level: 'error',
      rule_id: action.ruleId,
      rule_name: action.ruleName,
      priority: action.action.priority,
    })
  );
}

async function createDatadogCase(action: TriggeredAction): Promise<void> {
  // Log case creation for Datadog
  console.log(
    JSON.stringify({
      dd: {
        case: {
          title: action.ruleName,
          description: action.action.contextTemplate,
          priority: action.action.priority,
          assignee: action.action.notifyTeam,
          attributes: {
            detection_rule: action.ruleId,
            ...action.context,
          },
        },
      },
      message: 'case.created',
      level: 'warn',
      rule_id: action.ruleId,
      rule_name: action.ruleName,
    })
  );
}
