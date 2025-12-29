/**
 * Chat Types for Financial Assistant
 *
 * Types for the AI financial chat feature that answers
 * questions about spending, income, runway, etc.
 */

import type { QueryType, TimePeriod } from './query-patterns';

/**
 * Chat message from user or assistant
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: ChatMessageMetadata;
}

/**
 * Metadata attached to assistant responses
 */
export interface ChatMessageMetadata {
  queryType?: QueryType;
  period?: TimePeriod;
  confidence?: number;
  dataPoints?: DataPoint[];
  suggestions?: string[];
}

/**
 * Data point for visualization
 */
export interface DataPoint {
  label: string;
  value: number;
  formatted: string;
  percentage?: number;
}

/**
 * Chat request from client
 */
export interface ChatRequest {
  workspaceId: string;
  message: string;
  conversationId?: string;
}

/**
 * Chat response to client
 */
export interface ChatResponse {
  message: ChatMessage;
  conversationId: string;
}

/**
 * Financial context for generating responses
 */
export interface FinancialContext {
  workspaceId: string;
  baseCurrency: string;
  // Cached metrics to avoid repeated queries
  metrics?: CachedMetrics;
}

/**
 * Cached metrics for quick responses
 */
export interface CachedMetrics {
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  runway: {
    monthsRemaining: number;
    status: string;
  };
  categoryBreakdown: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
}

/**
 * Query execution result
 */
export interface QueryResult {
  success: boolean;
  data?: unknown;
  formatted?: string;
  error?: string;
  suggestions?: string[];
}

/**
 * Spending summary response
 */
export interface SpendingSummary {
  total: number;
  currency: string;
  formatted: string;
  period: string;
  breakdown?: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
}

/**
 * Merchant spending response
 */
export interface MerchantSpending {
  merchant: string;
  total: number;
  currency: string;
  formatted: string;
  transactionCount: number;
  period: string;
}

/**
 * Income summary response
 */
export interface IncomeSummary {
  total: number;
  currency: string;
  formatted: string;
  period: string;
  sources?: Array<{
    name: string;
    amount: number;
    percentage: number;
  }>;
}

/**
 * Runway response
 */
export interface RunwayResponse {
  monthsRemaining: number;
  currentCash: number;
  monthlyBurnRate: number;
  status: 'critical' | 'warning' | 'healthy' | 'excellent';
  description: string;
  projectedZeroDate?: string;
}

/**
 * Profitability response
 */
export interface ProfitabilityResponse {
  isProfitable: boolean;
  netIncome: number;
  currency: string;
  formatted: string;
  margin?: number;
  period: string;
}
