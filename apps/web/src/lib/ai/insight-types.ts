/**
 * AI Insight Type Definitions
 *
 * Types for AI-generated insights displayed throughout the dashboard.
 */

export type InsightType = 'opportunity' | 'alert' | 'tip' | 'anomaly';

export type InsightPriority = 'high' | 'medium' | 'low';

export interface InsightAction {
  /** Button label */
  label: string;
  /** Navigation href */
  href?: string;
  /** Click handler (alternative to href) */
  onClick?: () => void;
}

export interface AiInsight {
  /** Unique identifier */
  id: string;
  /** Insight type determines icon and color */
  type: InsightType;
  /** Priority for sorting */
  priority: InsightPriority;
  /** Short title */
  title: string;
  /** Detailed message */
  message: string;
  /** When the insight was generated */
  createdAt: string;
  /** Optional metric to highlight */
  metric?: {
    value: string;
    direction?: 'up' | 'down' | 'stable';
    label?: string;
  };
  /** Optional call-to-action */
  action?: InsightAction;
  /** Whether insight can be dismissed */
  dismissible?: boolean;
  /** Whether insight can be snoozed */
  snoozeable?: boolean;
  /** Confidence score (0-100) */
  confidence?: number;
  /** Source of the insight */
  source?: 'health-score' | 'forecast' | 'categorization' | 'anomaly-detection';
}

/**
 * Configuration for insight display
 */
export interface InsightConfig {
  type: InsightType;
  icon: string; // Lucide icon name
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

export const insightConfigs: Record<InsightType, InsightConfig> = {
  opportunity: {
    type: 'opportunity',
    icon: 'Lightbulb',
    colorClass: 'text-success',
    bgClass: 'bg-success/10',
    borderClass: 'border-success/20',
  },
  alert: {
    type: 'alert',
    icon: 'AlertTriangle',
    colorClass: 'text-warning',
    bgClass: 'bg-warning/10',
    borderClass: 'border-warning/20',
  },
  tip: {
    type: 'tip',
    icon: 'Sparkles',
    colorClass: 'text-ai',
    bgClass: 'bg-ai/10',
    borderClass: 'border-ai/20',
  },
  anomaly: {
    type: 'anomaly',
    icon: 'AlertCircle',
    colorClass: 'text-danger',
    bgClass: 'bg-danger/10',
    borderClass: 'border-danger/20',
  },
};

/**
 * Priority weight for sorting insights
 */
export const priorityWeight: Record<InsightPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Sort insights by priority (high first) and then by date (newest first)
 */
export function sortInsights(insights: AiInsight[]): AiInsight[] {
  return [...insights].sort((a, b) => {
    const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Filter insights by type
 */
export function filterInsightsByType(insights: AiInsight[], types: InsightType[]): AiInsight[] {
  return insights.filter((insight) => types.includes(insight.type));
}

/**
 * Get high priority insights
 */
export function getHighPriorityInsights(insights: AiInsight[]): AiInsight[] {
  return insights.filter((insight) => insight.priority === 'high');
}
