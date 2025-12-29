// Transaction categorization and matching

import type { EntityBase, UUID } from './common';

// Categorization
export type CategorizationMethod = 'ai' | 'rule' | 'user';

export interface TransactionCategorization {
  transactionId: UUID;
  categoryId: UUID;
  method: CategorizationMethod;
  confidence?: number;
  createdAt: string;
}

// Rules - matches Prisma Rule model
export interface Rule extends EntityBase {
  categoryId: UUID;
  name: string;
  conditions: RuleConditions;
  priority: number;
  isActive: boolean;
}

/**
 * Rule condition field - the transaction field to match against
 */
export type RuleConditionField = 'description' | 'amount' | 'merchant';

/**
 * Rule condition operator - how to compare the field value
 */
export type RuleConditionOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'regex'
  | 'gt'
  | 'lt'
  | 'between';

/**
 * A single rule condition
 */
export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string | number | [number, number];
  caseSensitive?: boolean;
}

/**
 * Rule conditions container with match mode
 */
export interface RuleConditions {
  match: 'all' | 'any'; // AND vs OR
  conditions: RuleCondition[];
}

// Matching (Invoice to Transaction)
export type MatchType = 'exact' | 'partial' | 'suggested';

export type MatchStatus = 'suggested' | 'approved' | 'rejected';

export interface Match extends EntityBase {
  invoiceId: UUID;
  transactionId: UUID;
  matchType: MatchType;
  status: MatchStatus;
  confidence?: number;
  notes?: string;
}
