// Rules engine for automatic categorization
import type {
  AmountRangeCondition,
  BankTransaction,
  ContainsTextCondition,
  IbanMatchCondition,
  MerchantMatchCondition,
  Rule,
  RuleAction,
  RuleCondition,
  UUID,
} from '@moneio/core-ledger';

export interface RuleRepository {
  findByWorkspace(workspaceId: UUID): Promise<Rule[]>;
  create(data: CreateRuleData): Promise<Rule>;
  update(id: UUID, data: UpdateRuleData): Promise<Rule>;
  delete(id: UUID): Promise<void>;
}

export interface CreateRuleData {
  workspaceId: UUID;
  kind: Rule['kind'];
  name: string;
  conditionJson: RuleCondition;
  actionJson: RuleAction;
  priority?: number;
}

export interface UpdateRuleData {
  name?: string;
  conditionJson?: RuleCondition;
  actionJson?: RuleAction;
  enabled?: boolean;
  priority?: number;
}

export interface RuleMatchResult {
  matched: boolean;
  rule?: Rule;
  action?: RuleAction;
}

export class RulesEngine {
  constructor(private readonly repository: RuleRepository) {}

  async getRules(workspaceId: UUID): Promise<Rule[]> {
    return this.repository.findByWorkspace(workspaceId);
  }

  async createRule(data: CreateRuleData): Promise<Rule> {
    return this.repository.create(data);
  }

  async updateRule(id: UUID, data: UpdateRuleData): Promise<Rule> {
    return this.repository.update(id, data);
  }

  async deleteRule(id: UUID): Promise<void> {
    return this.repository.delete(id);
  }

  async evaluateTransaction(
    workspaceId: UUID,
    transaction: BankTransaction
  ): Promise<RuleMatchResult> {
    const rules = await this.repository.findByWorkspace(workspaceId);

    // Sort by priority (higher priority first) and filter enabled rules
    const activeRules = rules.filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);

    for (const rule of activeRules) {
      if (this.matchesCondition(rule.conditionJson, transaction)) {
        return {
          matched: true,
          rule,
          action: rule.actionJson,
        };
      }
    }

    return { matched: false };
  }

  async evaluateTransactions(
    workspaceId: UUID,
    transactions: BankTransaction[]
  ): Promise<Map<UUID, RuleMatchResult>> {
    const results = new Map<UUID, RuleMatchResult>();
    const rules = await this.repository.findByWorkspace(workspaceId);

    const activeRules = rules.filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);

    for (const transaction of transactions) {
      for (const rule of activeRules) {
        if (this.matchesCondition(rule.conditionJson, transaction)) {
          results.set(transaction.id, {
            matched: true,
            rule,
            action: rule.actionJson,
          });
          break;
        }
      }

      if (!results.has(transaction.id)) {
        results.set(transaction.id, { matched: false });
      }
    }

    return results;
  }

  private matchesCondition(condition: RuleCondition, transaction: BankTransaction): boolean {
    switch (condition.kind) {
      case 'merchant_match':
        return this.matchesMerchant(condition, transaction);
      case 'contains_text':
        return this.matchesText(condition, transaction);
      case 'amount_range':
        return this.matchesAmount(condition, transaction);
      case 'iban_match':
        return this.matchesIban(condition, transaction);
      default:
        return false;
    }
  }

  private matchesMerchant(
    condition: MerchantMatchCondition,
    transaction: BankTransaction
  ): boolean {
    const counterparty = transaction.counterparty || '';
    const pattern = condition.merchantPattern;

    if (condition.caseSensitive) {
      return counterparty.includes(pattern);
    }
    return counterparty.toLowerCase().includes(pattern.toLowerCase());
  }

  private matchesText(condition: ContainsTextCondition, transaction: BankTransaction): boolean {
    let text: string;

    switch (condition.field) {
      case 'description':
        text = transaction.descriptionRaw;
        break;
      case 'counterparty':
        text = transaction.counterparty || '';
        break;
      case 'reference':
        text = transaction.reference || '';
        break;
      default:
        return false;
    }

    if (condition.caseSensitive) {
      return text.includes(condition.pattern);
    }
    return text.toLowerCase().includes(condition.pattern.toLowerCase());
  }

  private matchesAmount(condition: AmountRangeCondition, transaction: BankTransaction): boolean {
    const amount = transaction.amount.amount;

    // Check currency if specified
    if (condition.currency && transaction.amount.currency !== condition.currency) {
      return false;
    }

    // Check range
    if (condition.minAmount !== undefined && amount < condition.minAmount) {
      return false;
    }
    if (condition.maxAmount !== undefined && amount > condition.maxAmount) {
      return false;
    }

    return true;
  }

  private matchesIban(condition: IbanMatchCondition, _transaction: BankTransaction): boolean {
    // IBAN matching would require access to bank account data
    // For now, this is a placeholder
    // In production, we'd look up the transaction's bank account IBAN
    return condition.ibanPattern.length > 0;
  }
}

// Helper to create common rule conditions
export const RuleConditionBuilder = {
  merchantMatch(pattern: string, caseSensitive = false): MerchantMatchCondition {
    return {
      kind: 'merchant_match',
      merchantPattern: pattern,
      caseSensitive,
    };
  },

  containsText(
    pattern: string,
    field: 'description' | 'counterparty' | 'reference' = 'description',
    caseSensitive = false
  ): ContainsTextCondition {
    return {
      kind: 'contains_text',
      pattern,
      field,
      caseSensitive,
    };
  },

  amountRange(minAmount?: number, maxAmount?: number, currency?: string): AmountRangeCondition {
    return {
      kind: 'amount_range',
      minAmount,
      maxAmount,
      currency,
    };
  },

  ibanMatch(pattern: string): IbanMatchCondition {
    return {
      kind: 'iban_match',
      ibanPattern: pattern,
    };
  },
};

// Helper to create rule actions
export const RuleActionBuilder = {
  setCategory(categoryId: string): RuleAction {
    return { setCategoryId: categoryId };
  },

  setMerchant(merchantId: string): RuleAction {
    return { setMerchantId: merchantId };
  },

  addTags(tags: string[]): RuleAction {
    return { addTags: tags };
  },

  combined(actions: RuleAction): RuleAction {
    return actions;
  },
};
