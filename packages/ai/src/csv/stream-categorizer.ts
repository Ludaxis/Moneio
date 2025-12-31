/**
 * Stream Categorizer - Per-row categorization during CSV import
 *
 * Optimized for processing rows as they're imported, combining:
 * 1. Rule-based matching (fast, deterministic)
 * 2. Heuristic patterns (medium speed)
 * 3. AI categorization (slower, more accurate)
 *
 * Uses a tiered approach to minimize AI calls while maximizing accuracy.
 */

import type { LlmClient } from '../extraction/invoice-extractor';
import type { ModelInfo } from '../types';

/**
 * Category definition for categorization
 */
export interface CategoryDefinition {
  id: string;
  name: string;
  type: 'expense' | 'income' | 'transfer' | 'other';
  keywords?: string[];
}

/**
 * Rule definition for rule-based matching
 */
export interface CategoryRule {
  id: string;
  categoryId: string;
  conditions: {
    field: 'description' | 'amount' | 'merchant';
    operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'regex' | 'gt' | 'lt';
    value: string | number;
    caseSensitive?: boolean;
  }[];
  match: 'all' | 'any';
  priority: number;
}

/**
 * Result of categorizing a single row
 */
export interface RowCategorizationResult {
  /** Suggested category ID */
  categoryId: string | null;

  /** Category name for display */
  categoryName: string | null;

  /** Confidence score 0-100 */
  confidence: number;

  /** How the category was determined */
  method: 'rule' | 'heuristic' | 'ai' | 'none';

  /** Explanation for the categorization */
  reasoning: string;

  /** Rule ID if matched by rule */
  matchedRuleId?: string;

  /** Model info if AI was used */
  modelInfo?: ModelInfo;
}

/**
 * Configuration for stream categorizer
 */
export interface StreamCategorizerConfig {
  /** Categories available in the workspace */
  categories: CategoryDefinition[];

  /** Rules to apply (sorted by priority) */
  rules?: CategoryRule[];

  /** Enable AI categorization for unmatched rows */
  enableAi?: boolean;

  /** Minimum confidence for AI suggestions */
  minAiConfidence?: number;

  /** Locale for pattern matching */
  locale?: string;
}

/**
 * Common patterns for heuristic matching
 */
const HEURISTIC_PATTERNS: Map<RegExp, { keywords: string[]; type: 'expense' | 'income' }> =
  new Map([
    // Software & Subscriptions
    [
      /openai|anthropic|supabase|stripe|github|aws|azure|digitalocean|cloudflare|vercel|netlify|heroku|mongodb|neon|upstash|railway|render/i,
      { keywords: ['software', 'subscriptions', 'technology'], type: 'expense' },
    ],
    // SaaS subscriptions
    [
      /netflix|spotify|youtube|adobe|slack|notion|figma|zoom|dropbox|1password|lastpass/i,
      { keywords: ['subscriptions', 'software'], type: 'expense' },
    ],
    // Food & Dining
    [
      /starbucks|coffee|cafe|restaurant|food|mcdonald|burger|pizza|dining/i,
      { keywords: ['food', 'dining', 'meals'], type: 'expense' },
    ],
    // Transportation
    [
      /uber|lyft|taxi|bolt|grab|fuel|gas|shell|parking/i,
      { keywords: ['transportation', 'travel'], type: 'expense' },
    ],
    // Shopping
    [
      /amazon|amzn|ebay|aliexpress|walmart|target/i,
      { keywords: ['shopping', 'office'], type: 'expense' },
    ],
    // Utilities
    [
      /electric|water|utility|power|heating|internet|phone|mobile/i,
      { keywords: ['utilities'], type: 'expense' },
    ],
    // Bank fees
    [
      /\bfee\b|\bcharge\b|commission|interest|service\s+charge/i,
      { keywords: ['fees', 'bank'], type: 'expense' },
    ],
    // Salary/Income
    [
      /salary|payroll|wage|income|deposit|payment\s+received|client\s+payment/i,
      { keywords: ['income', 'revenue', 'sales'], type: 'income' },
    ],
    // Transfers
    [
      /transfer|zelle|venmo|paypal|wise|revolut/i,
      { keywords: ['transfer'], type: 'expense' },
    ],
    // Business entities (Estonian, German, etc.)
    [/\b(OÜ|AS|Ltd|LLC|Inc|Corp|GmbH|BV|SA|Oy|AB)\b/i, { keywords: ['business', 'operating'], type: 'expense' }],
  ]);

/**
 * Stream Categorizer - categorizes rows as they're imported
 */
export class StreamCategorizer {
  private readonly categories: CategoryDefinition[];
  private readonly rules: CategoryRule[];
  private readonly enableAi: boolean;
  private readonly minAiConfidence: number;

  constructor(
    config: StreamCategorizerConfig,
    private readonly llmClient?: LlmClient
  ) {
    this.categories = config.categories;
    this.rules = (config.rules || []).sort((a, b) => b.priority - a.priority);
    this.enableAi = config.enableAi ?? true;
    this.minAiConfidence = config.minAiConfidence ?? 50;
  }

  /**
   * Categorize a single row
   */
  async categorizeRow(row: {
    description: string;
    amount: number;
    merchant?: string;
  }): Promise<RowCategorizationResult> {
    // Step 1: Try rule-based matching (fastest)
    const ruleMatch = this.matchByRules(row);
    if (ruleMatch) {
      return ruleMatch;
    }

    // Step 2: Try heuristic pattern matching (fast)
    const heuristicMatch = this.matchByHeuristics(row);
    if (heuristicMatch && heuristicMatch.confidence >= 60) {
      return heuristicMatch;
    }

    // Step 3: Use AI if enabled (slowest, most accurate)
    if (this.enableAi && this.llmClient) {
      const aiMatch = await this.matchByAi(row);
      if (aiMatch && aiMatch.confidence >= this.minAiConfidence) {
        return aiMatch;
      }
    }

    // Step 4: Return heuristic match if it exists (even with low confidence)
    if (heuristicMatch) {
      return heuristicMatch;
    }

    // No match found
    return {
      categoryId: null,
      categoryName: null,
      confidence: 0,
      method: 'none',
      reasoning: 'No matching category found',
    };
  }

  /**
   * Categorize multiple rows in batch
   */
  async categorizeBatch(
    rows: Array<{ description: string; amount: number; merchant?: string }>
  ): Promise<RowCategorizationResult[]> {
    const results: RowCategorizationResult[] = [];

    // Process in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((row) => this.categorizeRow(row)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Match by rules (step 1)
   */
  private matchByRules(row: {
    description: string;
    amount: number;
    merchant?: string;
  }): RowCategorizationResult | null {
    for (const rule of this.rules) {
      if (this.evaluateRule(rule, row)) {
        const category = this.categories.find((c) => c.id === rule.categoryId);
        if (category) {
          return {
            categoryId: category.id,
            categoryName: category.name,
            confidence: 100, // Rules are deterministic
            method: 'rule',
            reasoning: `Matched rule: ${rule.id}`,
            matchedRuleId: rule.id,
          };
        }
      }
    }
    return null;
  }

  /**
   * Evaluate a rule against a row
   */
  private evaluateRule(
    rule: CategoryRule,
    row: { description: string; amount: number; merchant?: string }
  ): boolean {
    const results = rule.conditions.map((condition) => {
      const fieldValue =
        condition.field === 'description'
          ? row.description
          : condition.field === 'amount'
            ? row.amount
            : row.merchant || '';

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
          case 'endsWith':
            return fieldStr.endsWith(valueStr);
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
   * Match by heuristic patterns (step 2)
   */
  private matchByHeuristics(row: {
    description: string;
    amount: number;
  }): RowCategorizationResult | null {
    const isExpense = row.amount < 0;
    const isIncome = row.amount > 0;

    for (const [pattern, { keywords, type }] of HEURISTIC_PATTERNS) {
      if (pattern.test(row.description)) {
        // Check type compatibility
        if ((isExpense && type === 'income') || (isIncome && type === 'expense' && type !== 'expense')) {
          continue;
        }

        // Find matching category
        const category = this.findCategoryByKeywords(keywords, isExpense ? 'expense' : 'income');
        if (category) {
          return {
            categoryId: category.id,
            categoryName: category.name,
            confidence: 70,
            method: 'heuristic',
            reasoning: `Matched pattern: ${pattern.source}`,
          };
        }
      }
    }

    // Default fallback based on amount sign
    const fallbackCategory = this.categories.find(
      (c) => c.type === (isExpense ? 'expense' : 'income') && c.name.toLowerCase() !== 'uncategorized'
    );

    if (fallbackCategory) {
      return {
        categoryId: fallbackCategory.id,
        categoryName: fallbackCategory.name,
        confidence: 30,
        method: 'heuristic',
        reasoning: `Default ${isExpense ? 'expense' : 'income'} category`,
      };
    }

    return null;
  }

  /**
   * Find category by keywords
   */
  private findCategoryByKeywords(
    keywords: string[],
    preferredType?: 'expense' | 'income'
  ): CategoryDefinition | null {
    // Score categories by keyword match
    const scored = this.categories
      .filter((c) => c.name.toLowerCase() !== 'uncategorized')
      .map((category) => {
        let score = 0;
        const nameLower = category.name.toLowerCase();

        for (const keyword of keywords) {
          if (nameLower.includes(keyword.toLowerCase())) {
            score += 10;
          }
          if (category.keywords?.some((k) => k.toLowerCase().includes(keyword.toLowerCase()))) {
            score += 5;
          }
        }

        // Boost if type matches
        if (preferredType && category.type === preferredType) {
          score += 3;
        }

        return { category, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.category || null;
  }

  /**
   * Match by AI (step 3)
   */
  private async matchByAi(row: {
    description: string;
    amount: number;
    merchant?: string;
  }): Promise<RowCategorizationResult | null> {
    if (!this.llmClient) return null;

    const categoryList = this.categories
      .filter((c) => c.name.toLowerCase() !== 'uncategorized')
      .map((c) => `- ${c.name} (${c.type})`)
      .join('\n');

    const isExpense = row.amount < 0;

    const prompt = `Categorize this transaction:
Description: "${row.description}"
Amount: ${Math.abs(row.amount).toFixed(2)} (${isExpense ? 'EXPENSE' : 'INCOME'})
${row.merchant ? `Merchant: ${row.merchant}` : ''}

Available categories:
${categoryList}

Return JSON only:
{
  "categoryName": "exact category name",
  "confidence": 50-95,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.llmClient.complete(prompt);
      const parsed = JSON.parse(response);

      const categoryName = parsed.categoryName || parsed.category;
      const category = this.categories.find(
        (c) => c.name.toLowerCase() === categoryName?.toLowerCase()
      );

      if (category) {
        return {
          categoryId: category.id,
          categoryName: category.name,
          confidence: Math.min(95, Math.max(50, parsed.confidence || 60)),
          method: 'ai',
          reasoning: parsed.reasoning || 'AI categorization',
          modelInfo: this.llmClient.getModelInfo(),
        };
      }
    } catch (error) {
      console.error('[StreamCategorizer] AI categorization failed:', error);
    }

    return null;
  }
}

/**
 * Factory function to create stream categorizer
 */
export function createStreamCategorizer(
  config: StreamCategorizerConfig,
  llmClient?: LlmClient
): StreamCategorizer {
  return new StreamCategorizer(config, llmClient);
}
