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

// Rules
export type RuleKind = 'merchant_match' | 'contains_text' | 'amount_range' | 'iban_match';

export interface Rule extends EntityBase {
  kind: RuleKind;
  name: string;
  conditionJson: RuleCondition;
  actionJson: RuleAction;
  enabled: boolean;
  priority: number;
}

export type RuleCondition =
  | MerchantMatchCondition
  | ContainsTextCondition
  | AmountRangeCondition
  | IbanMatchCondition;

export interface MerchantMatchCondition {
  kind: 'merchant_match';
  merchantPattern: string;
  caseSensitive?: boolean;
}

export interface ContainsTextCondition {
  kind: 'contains_text';
  pattern: string;
  field: 'description' | 'counterparty' | 'reference';
  caseSensitive?: boolean;
}

export interface AmountRangeCondition {
  kind: 'amount_range';
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
}

export interface IbanMatchCondition {
  kind: 'iban_match';
  ibanPattern: string;
}

export interface RuleAction {
  setCategoryId?: string;
  setMerchantId?: string;
  addTags?: string[];
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
