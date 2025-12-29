/**
 * Rules Engine for automatic transaction categorization
 *
 * This is the single source of truth for rule evaluation logic.
 * API routes and services should import from this module.
 */

import type {
  BankTransaction,
  Rule,
  RuleCondition,
  RuleConditionField,
  RuleConditions,
  UUID,
} from '@moneio/core-ledger';

/**
 * Transaction data structure for rule evaluation
 * Handles both domain BankTransaction and plain objects
 */
export interface TransactionData {
  description?: string | null;
  amount: number | { toNumber: () => number };
  rawData?: Record<string, unknown> | null;
}

/**
 * Result of evaluating rules against a transaction
 */
export interface RuleMatchResult {
  transactionId: UUID;
  ruleId: UUID;
  categoryId: UUID;
}

/**
 * Get the value of a field from a transaction for comparison
 */
function getFieldValue(transaction: TransactionData, field: RuleConditionField): string | number {
  switch (field) {
    case 'description':
      return transaction.description || '';
    case 'amount':
      // Handle Decimal type from Prisma or Money type
      if (
        typeof transaction.amount === 'object' &&
        transaction.amount !== null &&
        'toNumber' in transaction.amount
      ) {
        return transaction.amount.toNumber();
      }
      return Number(transaction.amount);
    case 'merchant':
      // Extract merchant from rawData if available
      if (transaction.rawData && typeof transaction.rawData === 'object') {
        const rawObj = transaction.rawData;
        return typeof rawObj.merchant === 'string' ? rawObj.merchant : '';
      }
      return '';
    default:
      return '';
  }
}

/**
 * Evaluate a single condition against a transaction
 */
export function evaluateCondition(condition: RuleCondition, transaction: TransactionData): boolean {
  const fieldValue = getFieldValue(transaction, condition.field);
  const { operator, value, caseSensitive } = condition;

  // Handle string comparisons
  if (typeof fieldValue === 'string') {
    const compareValue = String(value);
    const fieldStr = caseSensitive ? fieldValue : fieldValue.toLowerCase();
    const valueStr = caseSensitive ? compareValue : compareValue.toLowerCase();

    switch (operator) {
      case 'contains':
        return fieldStr.includes(valueStr);
      case 'equals':
        return fieldStr === valueStr;
      case 'startsWith':
        return fieldStr.startsWith(valueStr);
      case 'endsWith':
        return fieldStr.endsWith(valueStr);
      case 'regex':
        try {
          const flags = caseSensitive ? '' : 'i';
          const regex = new RegExp(compareValue, flags);
          return regex.test(fieldValue);
        } catch {
          // Invalid regex pattern
          return false;
        }
      default:
        return false;
    }
  }

  // Handle numeric comparisons
  if (typeof fieldValue === 'number') {
    switch (operator) {
      case 'equals':
        return fieldValue === Number(value);
      case 'gt':
        return fieldValue > Number(value);
      case 'lt':
        return fieldValue < Number(value);
      case 'between':
        if (Array.isArray(value) && value.length === 2) {
          return fieldValue >= value[0] && fieldValue <= value[1];
        }
        return false;
      default:
        return false;
    }
  }

  return false;
}

/**
 * Parse rule conditions from a JSON value
 */
function parseConditions(conditions: unknown): RuleConditions | null {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) {
    return null;
  }

  const obj = conditions as Record<string, unknown>;
  if (
    typeof obj.match === 'string' &&
    (obj.match === 'all' || obj.match === 'any') &&
    Array.isArray(obj.conditions)
  ) {
    return obj as unknown as RuleConditions;
  }

  return null;
}

/**
 * Evaluate all conditions for a rule against a transaction
 */
export function evaluateRule(
  rule: { conditions: unknown; isActive?: boolean },
  transaction: TransactionData
): boolean {
  const conditions = parseConditions(rule.conditions);

  if (!conditions || conditions.conditions.length === 0) {
    return false;
  }

  const results = conditions.conditions.map((condition) =>
    evaluateCondition(condition as RuleCondition, transaction)
  );

  // 'all' = AND (every condition must match), 'any' = OR (at least one must match)
  return conditions.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Find the first matching rule for a transaction from a list of rules
 * Rules should be sorted by priority (highest first)
 */
export function findMatchingRule<T extends { isActive?: boolean; conditions: unknown }>(
  rules: T[],
  transaction: TransactionData
): T | null {
  for (const rule of rules) {
    // Check isActive if the property exists
    if ('isActive' in rule && !rule.isActive) {
      continue;
    }
    if (evaluateRule(rule, transaction)) {
      return rule;
    }
  }
  return null;
}

/**
 * Convert BankTransaction to TransactionData for rule evaluation
 */
function toTransactionData(tx: BankTransaction): TransactionData {
  return {
    description: tx.descriptionRaw,
    amount: tx.amount.amount,
    rawData: tx.metadata as Record<string, unknown> | null,
  };
}

/**
 * Apply rules to multiple transactions and return categorization results
 */
export function applyRulesToTransactions(
  rules: Rule[],
  transactions: BankTransaction[]
): RuleMatchResult[] {
  const results: RuleMatchResult[] = [];

  // Sort rules by priority (highest first)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  for (const transaction of transactions) {
    const matchingRule = findMatchingRule(sortedRules, toTransactionData(transaction));
    if (matchingRule) {
      results.push({
        transactionId: transaction.id,
        ruleId: matchingRule.id,
        categoryId: matchingRule.categoryId,
      });
    }
  }

  return results;
}

/**
 * Test a single rule against a list of transactions
 * Returns which transactions would match
 */
export function testRuleAgainstTransactions(
  rule: { conditions: unknown; isActive?: boolean },
  transactions: BankTransaction[]
): BankTransaction[] {
  return transactions.filter((transaction) => evaluateRule(rule, toTransactionData(transaction)));
}

/**
 * Evaluate a rule against Prisma BankTransaction format
 * This is a convenience function for API routes using Prisma types
 */
export function evaluateRuleForPrismaTransaction(
  rule: { conditions: unknown; isActive?: boolean },
  transaction: {
    description?: string | null;
    amount: { toNumber: () => number } | number;
    rawData?: unknown;
  }
): boolean {
  const txData: TransactionData = {
    description: transaction.description,
    amount: transaction.amount,
    rawData: transaction.rawData as Record<string, unknown> | null,
  };
  return evaluateRule(rule, txData);
}

/**
 * Find matching rule for Prisma BankTransaction format
 */
export function findMatchingRuleForPrismaTransaction<
  T extends { isActive?: boolean; conditions: unknown },
>(
  rules: T[],
  transaction: {
    description?: string | null;
    amount: { toNumber: () => number } | number;
    rawData?: unknown;
  }
): T | null {
  const txData: TransactionData = {
    description: transaction.description,
    amount: transaction.amount,
    rawData: transaction.rawData as Record<string, unknown> | null,
  };
  return findMatchingRule(rules, txData);
}

/**
 * Test rule against Prisma BankTransaction array
 */
export function testRuleAgainstPrismaTransactions<
  T extends {
    id: string;
    description?: string | null;
    amount: { toNumber: () => number };
    rawData?: unknown;
  },
>(rule: { conditions: unknown; isActive?: boolean }, transactions: T[]): T[] {
  return transactions.filter((transaction) => {
    const txData: TransactionData = {
      description: transaction.description,
      amount: transaction.amount,
      rawData: transaction.rawData as Record<string, unknown> | null,
    };
    return evaluateRule(rule, txData);
  });
}
