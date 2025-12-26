// AI-powered transaction categorizer
import type { BankTransaction, Category, UUID } from '@moneio/core-ledger';

import type { AiProposal, ModelInfo, WorkspaceContext } from '../types.js';
import type { LlmClient } from '../extraction/invoice-extractor.js';

export interface CategoryProposal {
  categoryId: UUID;
  categoryName: string;
  confidence: number;
  reasoning: string;
}

export interface TransactionCategorizerAdapter {
  categorizeTransaction(
    transaction: BankTransaction,
    categories: Category[],
    context: WorkspaceContext
  ): Promise<AiProposal<CategoryProposal>>;

  categorizeTransactions(
    transactions: BankTransaction[],
    categories: Category[],
    context: WorkspaceContext
  ): Promise<Map<UUID, AiProposal<CategoryProposal>>>;
}

export class TransactionCategorizer implements TransactionCategorizerAdapter {
  constructor(private readonly llm: LlmClient) {}

  async categorizeTransaction(
    transaction: BankTransaction,
    categories: Category[],
    context: WorkspaceContext
  ): Promise<AiProposal<CategoryProposal>> {
    const prompt = this.buildPrompt(transaction, categories, context);
    const response = await this.llm.complete(prompt);

    const parsed = this.parseResponse(response, categories);

    return {
      data: parsed,
      confidence: parsed.confidence,
      evidence: [
        {
          sourceText: transaction.descriptionRaw,
          reasoning: parsed.reasoning,
        },
      ],
      modelInfo: this.llm.getModelInfo(),
    };
  }

  async categorizeTransactions(
    transactions: BankTransaction[],
    categories: Category[],
    context: WorkspaceContext
  ): Promise<Map<UUID, AiProposal<CategoryProposal>>> {
    const results = new Map<UUID, AiProposal<CategoryProposal>>();

    // Process in batches for efficiency
    const batchSize = 10;
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);

      const promises = batch.map((tx) =>
        this.categorizeTransaction(tx, categories, context).then((result) => ({
          id: tx.id,
          result,
        }))
      );

      const batchResults = await Promise.all(promises);
      for (const { id, result } of batchResults) {
        results.set(id, result);
      }
    }

    return results;
  }

  private buildPrompt(
    transaction: BankTransaction,
    categories: Category[],
    context: WorkspaceContext
  ): string {
    const categoryList = categories
      .map((c) => `- ${c.id}: ${c.name} (${c.type})`)
      .join('\n');

    return `You are a financial transaction categorizer. Categorize the following transaction.

Transaction:
- Description: ${transaction.descriptionRaw}
- Amount: ${transaction.amount.amount / 100} ${transaction.amount.currency}
- Counterparty: ${transaction.counterparty || 'Unknown'}
- Reference: ${transaction.reference || 'None'}
- Date: ${transaction.postedAt}

Available Categories:
${categoryList}

Context:
- Locale: ${context.locale}
- Known Merchants: ${context.merchantNames?.slice(0, 10).join(', ') || 'None'}

Respond with JSON:
{
  "categoryId": "<category UUID>",
  "categoryName": "<category name>",
  "confidence": <0-100>,
  "reasoning": "<brief explanation>"
}

Choose the most appropriate category. Use high confidence (80+) only when clearly matching.`;
  }

  private parseResponse(response: string, categories: Category[]): CategoryProposal {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;

    try {
      const parsed = JSON.parse(jsonStr.trim());

      // Validate category exists
      const category = categories.find((c) => c.id === parsed.categoryId);
      if (!category) {
        // Fallback to first matching category by name
        const byName = categories.find(
          (c) => c.name.toLowerCase() === parsed.categoryName?.toLowerCase()
        );
        if (byName) {
          return {
            categoryId: byName.id,
            categoryName: byName.name,
            confidence: Math.min(parsed.confidence || 50, 80),
            reasoning: parsed.reasoning || 'Matched by category name',
          };
        }
        throw new Error('Invalid category');
      }

      return {
        categoryId: parsed.categoryId,
        categoryName: category.name,
        confidence: Math.min(parsed.confidence || 50, 100),
        reasoning: parsed.reasoning || 'AI categorization',
      };
    } catch {
      // Return low-confidence fallback
      const defaultCategory = categories.find((c) => c.type === 'expense') || categories[0];
      return {
        categoryId: defaultCategory.id,
        categoryName: defaultCategory.name,
        confidence: 20,
        reasoning: 'Unable to determine category with confidence',
      };
    }
  }
}

// Heuristic-based categorizer (fallback, no LLM needed)
export class HeuristicCategorizer implements TransactionCategorizerAdapter {
  private readonly patterns: Map<RegExp, string> = new Map([
    [/amazon|amzn/i, 'Shopping'],
    [/uber|lyft|taxi|grab/i, 'Transportation'],
    [/netflix|spotify|hulu|disney/i, 'Subscriptions'],
    [/starbucks|coffee|cafe/i, 'Food & Dining'],
    [/restaurant|dining|food/i, 'Food & Dining'],
    [/grocery|supermarket|walmart|target/i, 'Groceries'],
    [/gas|fuel|shell|exxon|bp/i, 'Transportation'],
    [/electric|water|utility|power/i, 'Utilities'],
    [/insurance|geico|allstate/i, 'Insurance'],
    [/rent|mortgage|housing/i, 'Housing'],
    [/salary|payroll|income/i, 'Income'],
    [/transfer|zelle|venmo|paypal/i, 'Transfers'],
  ]);

  async categorizeTransaction(
    transaction: BankTransaction,
    categories: Category[],
    _context: WorkspaceContext
  ): Promise<AiProposal<CategoryProposal>> {
    const description = transaction.descriptionRaw.toLowerCase();

    for (const [pattern, categoryName] of this.patterns) {
      if (pattern.test(description)) {
        const category = categories.find(
          (c) => c.name.toLowerCase() === categoryName.toLowerCase()
        );

        if (category) {
          return {
            data: {
              categoryId: category.id,
              categoryName: category.name,
              confidence: 70,
              reasoning: `Matched pattern: ${pattern.source}`,
            },
            confidence: 70,
            evidence: [
              {
                sourceText: transaction.descriptionRaw,
                reasoning: `Matched pattern: ${pattern.source}`,
              },
            ],
            modelInfo: {
              provider: 'heuristic',
              model: 'pattern-matcher',
              version: '1.0',
            },
          };
        }
      }
    }

    // Default to first expense category
    const defaultCategory =
      categories.find((c) => c.type === 'expense') || categories[0];

    return {
      data: {
        categoryId: defaultCategory.id,
        categoryName: defaultCategory.name,
        confidence: 20,
        reasoning: 'No pattern matched, using default category',
      },
      confidence: 20,
      evidence: [],
      modelInfo: {
        provider: 'heuristic',
        model: 'default-fallback',
        version: '1.0',
      },
    };
  }

  async categorizeTransactions(
    transactions: BankTransaction[],
    categories: Category[],
    context: WorkspaceContext
  ): Promise<Map<UUID, AiProposal<CategoryProposal>>> {
    const results = new Map<UUID, AiProposal<CategoryProposal>>();

    for (const tx of transactions) {
      const result = await this.categorizeTransaction(tx, categories, context);
      results.set(tx.id, result);
    }

    return results;
  }
}
