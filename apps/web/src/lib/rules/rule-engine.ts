import type { BankTransaction, Prisma, Rule } from '@moneio/db';

import type { RuleCondition, RuleConditionField, RuleConditions } from './types';

/**
 * Transaction data structure for rule evaluation
 * Handles both Prisma BankTransaction and plain objects
 */
interface TransactionData {
  description?: string | null;
  amount: number | Prisma.Decimal | { toNumber: () => number };
  rawData?: Prisma.JsonValue;
}

/**
 * Get the value of a field from a transaction for comparison
 */
function getFieldValue(transaction: TransactionData, field: RuleConditionField): string | number {
  switch (field) {
    case 'description':
      return transaction.description || '';
    case 'amount':
      // Handle Decimal type from Prisma
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
      if (
        transaction.rawData &&
        typeof transaction.rawData === 'object' &&
        !Array.isArray(transaction.rawData)
      ) {
        const rawObj = transaction.rawData as Record<string, unknown>;
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
 * Parse rule conditions from the JSON field
 */
function parseConditions(conditions: Prisma.JsonValue): RuleConditions | null {
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
export function evaluateRule(rule: Rule, transaction: TransactionData): boolean {
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
export function findMatchingRule(rules: Rule[], transaction: TransactionData): Rule | null {
  for (const rule of rules) {
    if (rule.isActive && evaluateRule(rule, transaction)) {
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
    description: tx.description,
    amount: tx.amount,
    rawData: tx.rawData,
  };
}

/**
 * Apply rules to multiple transactions and return categorization results
 */
export function applyRulesToTransactions(
  rules: Rule[],
  transactions: BankTransaction[]
): Array<{ transactionId: string; ruleId: string; categoryId: string }> {
  const results: Array<{ transactionId: string; ruleId: string; categoryId: string }> = [];

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
  rule: Rule,
  transactions: BankTransaction[]
): BankTransaction[] {
  return transactions.filter((transaction) => evaluateRule(rule, toTransactionData(transaction)));
}
