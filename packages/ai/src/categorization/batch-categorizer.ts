/**
 * Batch Categorizer for CSV Import
 *
 * Optimized for categorizing large batches of transactions during CSV import.
 * Uses a three-tier approach:
 * 1. Learned mappings (instant, free, highest priority)
 * 2. Workspace rules (instant, free)
 * 3. Batch LLM calls (parallel, 20 per batch, 5 concurrent)
 */

import type {
  MerchantCategoryMapping,
  MappingLookupResult,
} from '@moneio/domain';
import { applyLearnedMappings } from '@moneio/domain';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { ModelInfo } from '../types';

/**
 * Transaction input for batch categorization
 */
export interface BatchCategorizationTransaction {
  id: string;
  description: string;
  amount: number;
  counterpartyName?: string;
  date?: string;
  currency?: string;
  originalRow?: Record<string, string>;
}

/**
 * Category definition for categorization
 */
export interface CategoryInfo {
  id: string;
  name: string;
  type?: 'expense' | 'income' | 'transfer' | 'other';
}

/**
 * Prediction result for a single transaction
 */
export interface CategoryPrediction {
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  source: 'learned' | 'rule' | 'ai' | 'heuristic' | 'none';
  reasoning?: string;
  modelInfo?: ModelInfo;
}

/**
 * Categorization rule
 */
export interface CategorizationRule {
  id: string;
  categoryId: string;
  conditions: Array<{
    field: 'description' | 'amount' | 'merchant';
    operator: 'contains' | 'equals' | 'startsWith' | 'regex' | 'gt' | 'lt';
    value: string | number;
    caseSensitive?: boolean;
  }>;
  match: 'all' | 'any';
  priority: number;
}

/**
 * Batch categorization result
 */
export interface BatchCategorizationResult {
  predictions: Map<string, CategoryPrediction>;
  stats: {
    total: number;
    bySource: Record<string, number>;
    avgConfidence: number;
  };
}

/**
 * Batch categorizer configuration
 */
export interface BatchCategorizerConfig {
  /** LLM client for AI categorization */
  llmClient: LlmClient;
  /** Number of transactions per LLM batch call */
  batchSize?: number;
  /** Number of concurrent LLM calls */
  concurrency?: number;
  /** Minimum confidence threshold for AI suggestions */
  minAiConfidence?: number;
}

/**
 * Chunk array into smaller arrays
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * AI Batch Categorizer
 *
 * Categorizes transactions in batches using a tiered approach:
 * 1. Learned mappings (from user history)
 * 2. Workspace rules
 * 3. Batch LLM calls (parallel processing)
 */
export class AiBatchCategorizer {
  private readonly llmClient: LlmClient;
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly minAiConfidence: number;

  constructor(config: BatchCategorizerConfig) {
    this.llmClient = config.llmClient;
    this.batchSize = config.batchSize ?? 20;
    this.concurrency = config.concurrency ?? 5;
    this.minAiConfidence = config.minAiConfidence ?? 50;
  }

  /**
   * Categorize a batch of transactions
   */
  async categorize(input: {
    transactions: BatchCategorizationTransaction[];
    categories: CategoryInfo[];
    learnedMappings?: MerchantCategoryMapping[];
    rules?: CategorizationRule[];
  }): Promise<BatchCategorizationResult> {
    const { transactions, categories, learnedMappings = [], rules = [] } = input;

    const results = new Map<string, CategoryPrediction>();
    const stats = {
      total: transactions.length,
      bySource: { learned: 0, rule: 0, ai: 0, heuristic: 0, none: 0 },
      avgConfidence: 0,
    };

    if (transactions.length === 0) {
      return { predictions: results, stats };
    }

    // Phase 1: Apply learned mappings (instant, free)
    const { matched: learnedMatched, unmatched: afterLearned } =
      this.applyLearnedMappings(transactions, learnedMappings, categories);

    for (const [id, result] of learnedMatched) {
      results.set(id, {
        categoryId: result.categoryId,
        categoryName: result.categoryName,
        confidence: result.confidence * 100,
        source: 'learned',
        reasoning: `Learned from previous selections (used ${result.frequency} times)`,
      });
      stats.bySource.learned++;
    }

    // Phase 2: Apply workspace rules (instant, free)
    const { matched: ruleMatched, unmatched: afterRules } = this.applyRules(
      afterLearned,
      rules,
      categories
    );

    for (const [id, result] of ruleMatched) {
      results.set(id, result);
      stats.bySource.rule++;
    }

    // Phase 3: Batch LLM categorization (parallel)
    if (afterRules.length > 0) {
      const aiResults = await this.batchLlmCategorize(afterRules, categories);

      for (const [id, result] of aiResults) {
        results.set(id, result);
        if (result.source === 'ai') {
          stats.bySource.ai++;
        } else if (result.source === 'heuristic') {
          stats.bySource.heuristic++;
        } else {
          stats.bySource.none++;
        }
      }
    }

    // Calculate average confidence
    let totalConfidence = 0;
    for (const prediction of results.values()) {
      totalConfidence += prediction.confidence;
    }
    stats.avgConfidence = transactions.length > 0 ? totalConfidence / transactions.length : 0;

    return { predictions: results, stats };
  }

  /**
   * Apply learned mappings to transactions
   */
  private applyLearnedMappings(
    transactions: BatchCategorizationTransaction[],
    mappings: MerchantCategoryMapping[],
    categories: CategoryInfo[]
  ): {
    matched: Map<string, MappingLookupResult>;
    unmatched: BatchCategorizationTransaction[];
  } {
    if (mappings.length === 0) {
      return { matched: new Map(), unmatched: transactions };
    }

    // Add category names to mappings for lookup
    const mappingsWithNames = mappings.map((m) => {
      const category = categories.find((c) => c.id === m.categoryId);
      return {
        ...m,
        categoryName: category?.name || null,
      };
    });

    return applyLearnedMappings(transactions, mappingsWithNames);
  }

  /**
   * Apply workspace rules to transactions
   */
  private applyRules(
    transactions: BatchCategorizationTransaction[],
    rules: CategorizationRule[],
    categories: CategoryInfo[]
  ): {
    matched: Map<string, CategoryPrediction>;
    unmatched: BatchCategorizationTransaction[];
  } {
    if (rules.length === 0) {
      return { matched: new Map(), unmatched: transactions };
    }

    const matched = new Map<string, CategoryPrediction>();
    const unmatched: BatchCategorizationTransaction[] = [];

    // Sort rules by priority (highest first)
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const tx of transactions) {
      let found = false;

      for (const rule of sortedRules) {
        if (this.evaluateRule(rule, tx)) {
          const category = categories.find((c) => c.id === rule.categoryId);
          if (category) {
            matched.set(tx.id, {
              categoryId: category.id,
              categoryName: category.name,
              confidence: 100,
              source: 'rule',
              reasoning: `Matched rule: ${rule.id}`,
            });
            found = true;
            break;
          }
        }
      }

      if (!found) {
        unmatched.push(tx);
      }
    }

    return { matched, unmatched };
  }

  /**
   * Evaluate a rule against a transaction
   */
  private evaluateRule(
    rule: CategorizationRule,
    tx: BatchCategorizationTransaction
  ): boolean {
    const results = rule.conditions.map((condition) => {
      let fieldValue: string | number;
      if (condition.field === 'description') {
        fieldValue = tx.description || '';
      } else if (condition.field === 'amount') {
        fieldValue = tx.amount;
      } else {
        fieldValue = tx.counterpartyName || tx.description || '';
      }

      if (typeof fieldValue === 'string') {
        const compareValue = String(condition.value);
        const fieldStr = condition.caseSensitive ? fieldValue : fieldValue.toLowerCase();
        const valueStr = condition.caseSensitive ? compareValue : compareValue.toLowerCase();

        switch (condition.operator) {
          case 'contains':
            return fieldStr.includes(valueStr);
          case 'equals':
            return fieldStr === valueStr;
          case 'startsWith':
            return fieldStr.startsWith(valueStr);
          case 'regex':
            try {
              const regex = new RegExp(compareValue, condition.caseSensitive ? '' : 'i');
              return regex.test(fieldValue);
            } catch {
              return false;
            }
          default:
            return false;
        }
      }

      if (typeof fieldValue === 'number') {
        const numValue = Number(condition.value);
        switch (condition.operator) {
          case 'equals':
            return fieldValue === numValue;
          case 'gt':
            return fieldValue > numValue;
          case 'lt':
            return fieldValue < numValue;
          default:
            return false;
        }
      }

      return false;
    });

    return rule.match === 'all' ? results.every(Boolean) : results.some(Boolean);
  }

  /**
   * Batch LLM categorization with parallel processing
   */
  private async batchLlmCategorize(
    transactions: BatchCategorizationTransaction[],
    categories: CategoryInfo[]
  ): Promise<Map<string, CategoryPrediction>> {
    const results = new Map<string, CategoryPrediction>();

    // Split into batches
    const batches = chunk(transactions, this.batchSize);

    // Process batches with concurrency limit
    for (let i = 0; i < batches.length; i += this.concurrency) {
      const parallelBatches = batches.slice(i, i + this.concurrency);
      const batchResults = await Promise.all(
        parallelBatches.map((batch) => this.categorizeSingleBatch(batch, categories))
      );

      for (const batchResult of batchResults) {
        for (const [id, prediction] of batchResult) {
          results.set(id, prediction);
        }
      }
    }

    return results;
  }

  /**
   * Categorize a single batch of transactions with one LLM call
   */
  private async categorizeSingleBatch(
    transactions: BatchCategorizationTransaction[],
    categories: CategoryInfo[]
  ): Promise<Map<string, CategoryPrediction>> {
    const results = new Map<string, CategoryPrediction>();

    if (transactions.length === 0) {
      return results;
    }

    // Build batch prompt
    const prompt = this.buildBatchPrompt(transactions, categories);

    try {
      const response = await this.llmClient.complete(prompt);
      const parsed = this.parseBatchResponse(response, transactions, categories);

      for (const { id, prediction } of parsed) {
        results.set(id, prediction);
      }
    } catch (error) {
      console.error('[BatchCategorizer] LLM error:', error);
      // Fallback to heuristic for failed batch
      for (const tx of transactions) {
        const heuristic = this.heuristicCategorize(tx, categories);
        results.set(tx.id, heuristic);
      }
    }

    return results;
  }

  /**
   * Build prompt for batch categorization
   */
  private buildBatchPrompt(
    transactions: BatchCategorizationTransaction[],
    categories: CategoryInfo[]
  ): string {
    const categoryList = categories
      .filter((c) => c.name.toLowerCase() !== 'uncategorized')
      .map((c, i) => `${i + 1}. ${c.name}${c.type ? ` (${c.type})` : ''}`)
      .join('\n');

    const transactionList = transactions
      .map((tx, i) => {
        const isExpense = tx.amount < 0;
        const amountStr = Math.abs(tx.amount).toFixed(2);
        const type = isExpense ? 'EXPENSE' : 'INCOME';
        const merchant = tx.counterpartyName || '';
        const date = tx.date || '';

        return `${i + 1}. {id: "${tx.id}", description: "${tx.description}", amount: ${amountStr}, type: "${type}"${merchant ? `, merchant: "${merchant}"` : ''}${date ? `, date: "${date}"` : ''}}`;
      })
      .join('\n');

    return `You are a financial transaction categorizer for a business accounting system.

CATEGORIES:
${categoryList}

TRANSACTIONS TO CATEGORIZE:
${transactionList}

For each transaction, determine the best matching category based on:
- The description and merchant name
- The transaction type (EXPENSE or INCOME)
- Common business expense patterns

CATEGORIZATION RULES:
1. Software/SaaS services (OpenAI, Figma, GitHub, AWS, etc.) -> Software & Subscriptions or Technology
2. Marketing/Advertising (Facebook Ads, Google Ads) -> Marketing or Advertising
3. Office supplies, equipment -> Office Expenses
4. Travel, transportation (Uber, Bolt, flights) -> Transportation or Travel
5. Food, meals -> Food & Dining or Meals
6. Professional services (lawyers, accountants) -> Professional Services
7. Bank fees, charges -> Bank Fees or Financial Expenses
8. For business entities (OÜ, Ltd, Inc, GmbH) -> Consider Operating Expenses or the relevant category

Return a JSON array with one object per transaction:
[
  {"id": "<transaction id>", "categoryId": "<category number from list>", "categoryName": "<exact category name>", "confidence": <50-95>, "reason": "<brief explanation>"},
  ...
]

Important:
- Use EXACT category names from the list above
- Confidence should be 70-95 for clear matches, 50-69 for reasonable guesses
- Return the same number of items as transactions provided
- NEVER use "Uncategorized" if any other category could fit`;
  }

  /**
   * Parse LLM response for batch categorization
   */
  private parseBatchResponse(
    response: string,
    transactions: BatchCategorizationTransaction[],
    categories: CategoryInfo[]
  ): Array<{ id: string; prediction: CategoryPrediction }> {
    const results: Array<{ id: string; prediction: CategoryPrediction }> = [];
    const modelInfo = this.llmClient.getModelInfo();

    // Extract JSON array from response
    let jsonStr = response.trim();
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Find array brackets
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      // Create a map of transaction IDs for quick lookup
      const txMap = new Map(transactions.map((tx) => [tx.id, tx]));

      for (const item of parsed) {
        const id = item.id;
        const tx = txMap.get(id);

        if (!tx) continue;

        const categoryName = item.categoryName || item.category_name || item.category;
        let category = categories.find(
          (c) => c.name.toLowerCase() === categoryName?.toLowerCase()
        );

        // Try partial match
        if (!category && categoryName) {
          category = categories.find(
            (c) =>
              c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
              categoryName.toLowerCase().includes(c.name.toLowerCase())
          );
        }

        // Try by ID/number
        if (!category && item.categoryId) {
          const catIdx = parseInt(item.categoryId, 10) - 1;
          if (catIdx >= 0 && catIdx < categories.length) {
            category = categories[catIdx];
          }
        }

        if (category) {
          results.push({
            id,
            prediction: {
              categoryId: category.id,
              categoryName: category.name,
              confidence: Math.min(95, Math.max(this.minAiConfidence, item.confidence || 60)),
              source: 'ai',
              reasoning: item.reason || item.reasoning || 'AI categorization',
              modelInfo,
            },
          });
        } else {
          // Fallback to heuristic
          const heuristic = this.heuristicCategorize(tx, categories);
          results.push({ id, prediction: heuristic });
        }
      }

      // Handle any transactions not in the response
      for (const tx of transactions) {
        if (!results.some((r) => r.id === tx.id)) {
          const heuristic = this.heuristicCategorize(tx, categories);
          results.push({ id: tx.id, prediction: heuristic });
        }
      }
    } catch (error) {
      console.error('[BatchCategorizer] Parse error:', error);
      // Fallback all transactions to heuristic
      for (const tx of transactions) {
        const heuristic = this.heuristicCategorize(tx, categories);
        results.push({ id: tx.id, prediction: heuristic });
      }
    }

    return results;
  }

  /**
   * Heuristic categorization fallback
   */
  private heuristicCategorize(
    tx: BatchCategorizationTransaction,
    categories: CategoryInfo[]
  ): CategoryPrediction {
    const description = (tx.description || '').toLowerCase();
    const merchant = (tx.counterpartyName || '').toLowerCase();
    const text = `${description} ${merchant}`;
    const isExpense = tx.amount < 0;

    // Pattern matching
    const patterns: Array<{ regex: RegExp; keywords: string[]; confidence: number }> = [
      {
        regex: /openai|anthropic|chatgpt|claude|supabase|github|aws|azure|vercel|netlify|heroku|digitalocean|cloudflare|mongodb|neon|upstash|railway|render|stripe|twilio|sendgrid/i,
        keywords: ['software', 'subscriptions', 'technology', 'saas'],
        confidence: 85,
      },
      {
        regex: /figma|notion|slack|zoom|dropbox|adobe|canva|1password|linear/i,
        keywords: ['software', 'subscriptions', 'productivity'],
        confidence: 85,
      },
      {
        regex: /netflix|spotify|youtube|disney|hulu|apple\s+music/i,
        keywords: ['subscriptions', 'entertainment'],
        confidence: 80,
      },
      {
        regex: /facebook\s+ads|google\s+ads|meta\s+ads|linkedin\s+ads|twitter\s+ads|advertising/i,
        keywords: ['marketing', 'advertising'],
        confidence: 85,
      },
      {
        regex: /uber|lyft|bolt|grab|taxi|transportation/i,
        keywords: ['transportation', 'travel'],
        confidence: 80,
      },
      {
        regex: /starbucks|coffee|cafe|restaurant|food|dining|mcdonald|pizza|burger/i,
        keywords: ['food', 'dining', 'meals'],
        confidence: 80,
      },
      {
        regex: /amazon|amzn|ebay|shopify|walmart/i,
        keywords: ['shopping', 'office', 'supplies'],
        confidence: 70,
      },
      {
        regex: /insurance|geico|allstate/i,
        keywords: ['insurance'],
        confidence: 85,
      },
      {
        regex: /electric|water|utility|power|heating|internet|phone|mobile/i,
        keywords: ['utilities'],
        confidence: 85,
      },
      {
        regex: /\bfee\b|\bcharge\b|commission|bank\s+fee/i,
        keywords: ['fees', 'bank', 'financial'],
        confidence: 75,
      },
      {
        regex: /lawyer|attorney|legal|accountant|consultant|audit/i,
        keywords: ['professional', 'services', 'legal'],
        confidence: 80,
      },
      {
        regex: /\b(OÜ|AS|Ltd|LLC|Inc|Corp|GmbH|BV|SA|Oy|AB)\b/i,
        keywords: ['operating', 'business', 'expenses'],
        confidence: 60,
      },
    ];

    // Find matching pattern
    for (const { regex, keywords, confidence } of patterns) {
      if (regex.test(text)) {
        const category = this.findCategoryByKeywords(categories, keywords, isExpense);
        if (category) {
          return {
            categoryId: category.id,
            categoryName: category.name,
            confidence,
            source: 'heuristic',
            reasoning: `Pattern matched: ${regex.source}`,
          };
        }
      }
    }

    // No match - return low confidence suggestion
    const defaultCategory = categories.find(
      (c) =>
        c.name.toLowerCase() !== 'uncategorized' &&
        (isExpense ? c.type === 'expense' || !c.type : c.type === 'income')
    );

    if (defaultCategory) {
      return {
        categoryId: defaultCategory.id,
        categoryName: defaultCategory.name,
        confidence: 30,
        source: 'heuristic',
        reasoning: 'Default category - requires review',
      };
    }

    return {
      categoryId: null,
      categoryName: null,
      confidence: 0,
      source: 'none',
      reasoning: 'No matching category found',
    };
  }

  /**
   * Find category by keywords
   */
  private findCategoryByKeywords(
    categories: CategoryInfo[],
    keywords: string[],
    isExpense: boolean
  ): CategoryInfo | null {
    const scored = categories
      .filter((c) => c.name.toLowerCase() !== 'uncategorized')
      .map((category) => {
        let score = 0;
        const nameLower = category.name.toLowerCase();

        for (const keyword of keywords) {
          if (nameLower.includes(keyword.toLowerCase())) {
            score += 10;
          }
        }

        // Boost if type matches
        if (isExpense && (category.type === 'expense' || !category.type)) {
          score += 3;
        } else if (!isExpense && category.type === 'income') {
          score += 3;
        }

        return { category, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.category || null;
  }
}

/**
 * Create a batch categorizer instance
 */
export function createBatchCategorizer(config: BatchCategorizerConfig): AiBatchCategorizer {
  return new AiBatchCategorizer(config);
}
