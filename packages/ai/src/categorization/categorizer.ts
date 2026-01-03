// AI-powered transaction categorizer
import type { BankTransaction, Category, UUID } from '@moneio/core-ledger';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { AiProposal, WorkspaceContext } from '../types';
import { sanitizeTransactionDescription, sanitizeCounterpartyName } from '../utils/sanitize';

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
    _context: WorkspaceContext
  ): string {
    // Format categories as simple numbered list with names only
    const categoryList = categories
      .filter((c) => c.name.toLowerCase() !== 'uncategorized')
      .map((c, i) => `${i + 1}. ${c.name}`)
      .join('\n');

    const amount = transaction.amount.amount / 100;
    const isExpense = amount < 0;
    const isIncome = amount > 0;

    // Sanitize user-controlled inputs to prevent prompt injection
    const sanitizedDescription = sanitizeTransactionDescription(transaction.descriptionRaw);
    const sanitizedCounterparty = sanitizeCounterpartyName(transaction.counterparty);
    const sanitizedReference = transaction.reference
      ? transaction.reference.replace(/"/g, '\\"').slice(0, 100)
      : 'None';

    return `You are an expert financial transaction categorizer for a small business accounting system.

TRANSACTION TO CATEGORIZE:
- Description: "${sanitizedDescription}"
- Amount: ${Math.abs(amount).toFixed(2)} ${transaction.amount.currency} (${isExpense ? 'EXPENSE/OUTFLOW' : isIncome ? 'INCOME/INFLOW' : 'TRANSFER'})
- Counterparty: ${sanitizedCounterparty}
- Reference: ${sanitizedReference}
- Date: ${transaction.postedAt}

AVAILABLE CATEGORIES:
${categoryList}

CATEGORIZATION RULES:
1. For company/business name descriptions (e.g., "Company OÜ", "Ltd", "Inc"):
   - If description contains "OÜ", "Ltd", "Inc", "Corp", "LLC" → likely a business payment
   - Consider: Office Expenses, Professional Services, Software & Subscriptions, or Operating Expenses
2. For transfer-like descriptions → Internal Transfer or Bank Fees
3. For personal/lifestyle spending → Food & Dining, Entertainment, etc.
4. Match the transaction TYPE (expense vs income) to category TYPE
5. NEVER choose "Uncategorized" if ANY other category could reasonably fit

Respond ONLY with valid JSON (no markdown):
{
  "categoryName": "<exact category name from the list above>",
  "confidence": <50-95>,
  "reasoning": "<one sentence explanation>"
}

Important: Use the EXACT category name as shown in the list. Confidence should be 70-95 for clear matches, 50-69 for reasonable guesses.`;
  }

  private parseResponse(response: string, categories: Category[]): CategoryProposal {
    // Try to extract JSON from response (handles markdown code blocks)
    let jsonStr = response.trim();
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Also handle if AI wraps in just curly braces with extra text
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonStr = braceMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const categoryName = parsed.categoryName || parsed.category_name || parsed.category;

      if (!categoryName) {
        throw new Error('No category name in response');
      }

      // Find category by exact name match first
      let category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());

      // Try partial match if exact match fails
      if (!category) {
        category = categories.find(
          (c) =>
            c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
            categoryName.toLowerCase().includes(c.name.toLowerCase())
        );
      }

      // Exclude "Uncategorized" from matches if other options exist
      if (category?.name.toLowerCase() === 'uncategorized') {
        const nonUncategorized = categories.find(
          (c) => c.name.toLowerCase() !== 'uncategorized' && c.type === 'expense'
        );
        if (nonUncategorized) {
          category = nonUncategorized;
        }
      }

      if (category) {
        return {
          categoryId: category.id,
          categoryName: category.name,
          confidence: Math.min(Math.max(parsed.confidence || 60, 50), 95),
          reasoning: parsed.reasoning || 'AI categorization',
        };
      }

      throw new Error(`Category "${categoryName}" not found`);
    } catch (error) {
      console.error('[Categorizer] Parse error:', error, 'Response:', response.substring(0, 200));

      // Smart fallback: pick first non-Uncategorized expense category
      const fallbackCategory =
        categories.find((c) => c.type === 'expense' && c.name.toLowerCase() !== 'uncategorized') ||
        categories.find((c) => c.name.toLowerCase() !== 'uncategorized') ||
        categories[0];

      return {
        categoryId: fallbackCategory.id,
        categoryName: fallbackCategory.name,
        confidence: 30,
        reasoning: 'Fallback category - AI response could not be parsed',
      };
    }
  }
}

// Heuristic-based categorizer (fallback, no LLM needed)
export class HeuristicCategorizer implements TransactionCategorizerAdapter {
  // Business entity patterns - likely business expenses
  private readonly businessPatterns: RegExp[] = [
    /\b(OÜ|AS|Ltd|LLC|Inc|Corp|GmbH|BV|SA|SRL|Oy|AB)\b/i,
    /\b(company|enterprise|services|solutions|consulting)\b/i,
  ];

  // Categories that indicate income (not expenses)
  private readonly incomeCategories: string[] = [
    'sales revenue',
    'revenue',
    'income',
    'sales',
    'other income',
    'interest income',
    'service revenue',
  ];

  private readonly patterns: Map<RegExp, string[]> = new Map([
    // AI & Tech Services (EXPENSES) - expanded list
    [
      /openai|chatgpt|anthropic|claude|supabase|bluehost|hostinger|godaddy|digitalocean|cloudflare|stripe|twilio|sendgrid|mailchimp|reloadly|namecheap|stackblitz|linear\.app|posthog|sentry|datadog|newrelic|mongodb|planetscale|neon\.tech|upstash|railway|render|fly\.io|vercel|netlify|heroku/i,
      ['Software & Subscriptions', 'Subscriptions', 'Operating Expenses', 'Professional Services'],
    ],
    // Shopping & E-commerce
    [/amazon|amzn|ebay|aliexpress|shopify/i, ['Shopping', 'Office Expenses', 'Operating Expenses']],
    // Transportation (ride-sharing) - "bolt" without "stackblitz" context
    [
      /\buber\b|\blyft\b|\btaxi\b|\bgrab\b|bolt\.eu|bolt\s+technology/i,
      ['Transportation', 'Travel', 'Operating Expenses'],
    ],
    // Subscriptions & Software (general)
    [
      /netflix|spotify|hulu|disney|youtube|apple|google|microsoft|adobe|slack|notion|figma|github|aws|azure|firebase|1password|lastpass|dropbox|zoom|calendly/i,
      ['Software & Subscriptions', 'Subscriptions', 'Operating Expenses'],
    ],
    // Food & Dining
    [
      /starbucks|coffee|cafe|restaurant|dining|food|mcdonald|burger|pizza/i,
      ['Food & Dining', 'Meals', 'Entertainment'],
    ],
    // Groceries
    [
      /grocery|supermarket|walmart|target|costco|lidl|aldi|maxima|rimi|selver/i,
      ['Groceries', 'Food & Dining', 'Operating Expenses'],
    ],
    // Fuel & Transport
    [/gas|fuel|shell|exxon|bp|circle\s*k|neste/i, ['Transportation', 'Fuel', 'Operating Expenses']],
    // Utilities
    [
      /electric|water|utility|power|heating|internet|phone|mobile|telia|elisa/i,
      ['Utilities', 'Operating Expenses'],
    ],
    // Insurance
    [/insurance|geico|allstate|if\s+kindlustus/i, ['Insurance', 'Operating Expenses']],
    // Housing & Rent
    [/rent|mortgage|housing|lease/i, ['Housing', 'Rent', 'Operating Expenses']],
    // Income patterns (for POSITIVE amounts only)
    [/salary|payroll|income|deposit|payment\s+received/i, ['Income', 'Revenue', 'Sales Revenue']],
    // Transfers
    [/transfer|zelle|venmo|paypal|wise|revolut/i, ['Transfers', 'Internal Transfer', 'Bank Fees']],
    // Bank fees
    [/fee|charge|commission|interest/i, ['Bank Fees', 'Fees', 'Operating Expenses']],
    // Professional services
    [
      /lawyer|attorney|accountant|consultant|legal|audit/i,
      ['Professional Services', 'Legal & Professional', 'Operating Expenses'],
    ],
    // Marketing
    [
      /advertis|marketing|facebook\s+ads|google\s+ads|promotion/i,
      ['Marketing', 'Advertising', 'Operating Expenses'],
    ],
    // Office
    [
      /office|supplies|staples|printer|paper/i,
      ['Office Expenses', 'Supplies', 'Operating Expenses'],
    ],
  ]);

  async categorizeTransaction(
    transaction: BankTransaction,
    categories: Category[],
    _context: WorkspaceContext
  ): Promise<AiProposal<CategoryProposal>> {
    const description = transaction.descriptionRaw;
    const descLower = description.toLowerCase();

    // Determine if this is an expense (negative) or income (positive)
    const amount = transaction.amount.amount; // Already in cents
    const isExpense = amount < 0;
    const isIncome = amount > 0;

    // Helper to check if a category is an income category
    const isIncomeCategory = (categoryName: string): boolean => {
      const nameLower = categoryName.toLowerCase();
      return this.incomeCategories.some(
        (inc) => nameLower.includes(inc) || inc.includes(nameLower)
      );
    };

    // Helper to find category from candidate names, respecting income/expense type
    const findCategory = (candidateNames: string[]): Category | undefined => {
      for (const name of candidateNames) {
        const found = categories.find(
          (c) =>
            c.name.toLowerCase() === name.toLowerCase() ||
            c.name.toLowerCase().includes(name.toLowerCase())
        );
        if (found && found.name.toLowerCase() !== 'uncategorized') {
          // If it's an expense, don't return income categories
          if (isExpense && isIncomeCategory(found.name)) {
            continue;
          }
          // If it's income, don't return expense categories (unless no income categories exist)
          if (isIncome && !isIncomeCategory(found.name)) {
            // Check if there are any income categories available
            const hasIncomeCats = categories.some((c) => isIncomeCategory(c.name));
            if (hasIncomeCats) {
              continue;
            }
          }
          return found;
        }
      }
      return undefined;
    };

    // Check if it's a business entity (OÜ, Ltd, etc.) - these are typically expenses
    const isBusinessEntity = this.businessPatterns.some((p) => p.test(description));
    if (isBusinessEntity && isExpense) {
      const businessCategory = findCategory([
        'Operating Expenses',
        'Professional Services',
        'Software & Subscriptions',
        'Office Expenses',
        'Business Expenses',
        'General Expenses',
      ]);
      if (businessCategory) {
        return {
          data: {
            categoryId: businessCategory.id,
            categoryName: businessCategory.name,
            confidence: 65,
            reasoning: 'Business entity payment (contains company suffix)',
          },
          confidence: 65,
          evidence: [{ sourceText: description, reasoning: 'Business entity detected' }],
          modelInfo: { provider: 'heuristic', model: 'pattern-matcher', version: '2.0' },
        };
      }
    }

    // For business entities with positive amounts, it's likely client payment
    if (isBusinessEntity && isIncome) {
      const incomeCategory = findCategory([
        'Sales Revenue',
        'Revenue',
        'Income',
        'Service Revenue',
      ]);
      if (incomeCategory) {
        return {
          data: {
            categoryId: incomeCategory.id,
            categoryName: incomeCategory.name,
            confidence: 70,
            reasoning: 'Payment received from business entity',
          },
          confidence: 70,
          evidence: [{ sourceText: description, reasoning: 'Business entity income detected' }],
          modelInfo: { provider: 'heuristic', model: 'pattern-matcher', version: '2.0' },
        };
      }
    }

    // Check specific patterns
    for (const [pattern, candidateNames] of this.patterns) {
      if (pattern.test(descLower)) {
        const category = findCategory(candidateNames);
        if (category) {
          return {
            data: {
              categoryId: category.id,
              categoryName: category.name,
              confidence: 75,
              reasoning: `Matched pattern: ${pattern.source}`,
            },
            confidence: 75,
            evidence: [
              { sourceText: description, reasoning: `Pattern matched: ${pattern.source}` },
            ],
            modelInfo: { provider: 'heuristic', model: 'pattern-matcher', version: '2.0' },
          };
        }
      }
    }

    // For unknown transactions, prefer "Uncategorized" category
    // This is better UX than guessing wrong - user can manually categorize
    let fallbackCategory: Category | undefined;

    // First, try to find an "Uncategorized" category
    fallbackCategory = categories.find(
      (c) => c.name.toLowerCase() === 'uncategorized' || c.name.toLowerCase() === 'other'
    );

    // If no "Uncategorized" exists, use the first category but with very low confidence
    if (!fallbackCategory) {
      fallbackCategory = categories[0];
    }

    return {
      data: {
        categoryId: fallbackCategory.id,
        categoryName: fallbackCategory.name,
        confidence: 20, // Low confidence to indicate this needs review
        reasoning: 'No pattern matched - requires manual categorization',
      },
      confidence: 20,
      evidence: [],
      modelInfo: { provider: 'heuristic', model: 'default-fallback', version: '2.0' },
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
