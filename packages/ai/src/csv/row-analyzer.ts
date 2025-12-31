/**
 * AI Row Analyzer
 *
 * Uses AI to analyze CSV rows and determine if they're valid transactions
 * or should be excluded (turnover, summary, balance rows, etc.)
 */

import type { LlmClient } from '../extraction/invoice-extractor';
import type { ModelInfo } from '../types';

/**
 * Analysis result for a single row
 */
export interface RowAnalysis {
  /** Whether this row represents a valid transaction */
  isTransaction: boolean;

  /** Confidence score 0-100 */
  confidence: number;

  /** Explanation for the decision */
  reason: string;

  /** Flags for specific detections */
  flags: {
    isTurnover: boolean;
    isOpeningBalance: boolean;
    isClosingBalance: boolean;
    isSummaryRow: boolean;
    isDuplicate: boolean;
    isRefund: boolean;
    isFee: boolean;
    isTransfer: boolean;
  };

  /** Suggested category if detected */
  suggestedCategory?: string;

  /** Model info for auditing */
  modelInfo?: ModelInfo;
}

/**
 * Context for row analysis
 */
export interface RowAnalysisContext {
  /** Headers for the CSV */
  headers: string[];

  /** Previous rows for pattern detection */
  previousRows?: Record<string, string>[];

  /** Workspace locale */
  locale?: string;

  /** Available categories */
  categories?: string[];
}

const ROW_ANALYSIS_PROMPT = `You are an expert at analyzing bank statement CSV data. Analyze this row and determine if it's a valid transaction or should be excluded.

EXCLUDE these types of rows (isTransaction: false):
1. Opening/Closing Balance: "Opening Balance", "Closing Balance", "Algsaldo", "Lõppsaldo", "Anfangssaldo", "Endsaldo"
2. Summary/Total rows: "Total", "Subtotal", "Sum", "Kokku", "Summe", "Итого"
3. Turnover rows: "Turnover", "Period turnover", "Käive", "Umsatz"
4. Statement headers: "Statement period", "Account summary", "Page 1 of 2"
5. Balance forward: "Balance forward", "Carried forward", "Brought forward"
6. Empty/separator rows: "---", "===", mostly empty cells

INCLUDE as valid transactions (isTransaction: true):
1. Normal payments to/from merchants, people, companies
2. Transfers between accounts
3. Fee charges (isFee: true)
4. Refunds (isRefund: true)
5. Salary payments, subscriptions, bills

Row data:
`;

/**
 * AI-powered row analyzer
 */
export class AiRowAnalyzer {
  constructor(private readonly llmClient: LlmClient) {}

  /**
   * Analyze a single row to determine if it's a valid transaction
   */
  async analyzeRow(
    row: Record<string, string>,
    context: RowAnalysisContext
  ): Promise<RowAnalysis> {
    const prompt = this.buildPrompt(row, context);

    try {
      const response = await this.llmClient.complete(prompt);
      const parsed = JSON.parse(response);

      return {
        isTransaction: parsed.isTransaction ?? false,
        confidence: Math.min(100, Math.max(0, parsed.confidence ?? 50)),
        reason: parsed.reason ?? 'Unknown',
        flags: {
          isTurnover: parsed.flags?.isTurnover ?? false,
          isOpeningBalance: parsed.flags?.isOpeningBalance ?? false,
          isClosingBalance: parsed.flags?.isClosingBalance ?? false,
          isSummaryRow: parsed.flags?.isSummaryRow ?? false,
          isDuplicate: parsed.flags?.isDuplicate ?? false,
          isRefund: parsed.flags?.isRefund ?? false,
          isFee: parsed.flags?.isFee ?? false,
          isTransfer: parsed.flags?.isTransfer ?? false,
        },
        suggestedCategory: parsed.suggestedCategory,
        modelInfo: this.llmClient.getModelInfo(),
      };
    } catch (error) {
      // On AI failure, assume it's a transaction (conservative)
      return {
        isTransaction: true,
        confidence: 30,
        reason: 'AI analysis failed, assuming transaction',
        flags: {
          isTurnover: false,
          isOpeningBalance: false,
          isClosingBalance: false,
          isSummaryRow: false,
          isDuplicate: false,
          isRefund: false,
          isFee: false,
          isTransfer: false,
        },
      };
    }
  }

  /**
   * Analyze multiple rows in batch
   */
  async analyzeBatch(
    rows: Record<string, string>[],
    context: RowAnalysisContext
  ): Promise<RowAnalysis[]> {
    // Process in parallel with concurrency limit
    const concurrency = 5;
    const results: RowAnalysis[] = [];

    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((row, idx) =>
          this.analyzeRow(row, {
            ...context,
            previousRows: rows.slice(0, i + idx),
          })
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Build the prompt for row analysis
   */
  private buildPrompt(row: Record<string, string>, context: RowAnalysisContext): string {
    let prompt = ROW_ANALYSIS_PROMPT;

    // Add row data as key-value pairs
    prompt += '\n```\n';
    for (const [key, value] of Object.entries(row)) {
      if (value?.trim()) {
        prompt += `${key}: ${value}\n`;
      }
    }
    prompt += '```\n';

    // Add context
    if (context.locale) {
      prompt += `\nLocale: ${context.locale}`;
    }

    if (context.categories && context.categories.length > 0) {
      prompt += `\nAvailable categories: ${context.categories.join(', ')}`;
    }

    prompt += `

Return JSON:
{
  "isTransaction": true/false,
  "confidence": 0-100,
  "reason": "Brief explanation",
  "flags": {
    "isTurnover": false,
    "isOpeningBalance": false,
    "isClosingBalance": false,
    "isSummaryRow": false,
    "isDuplicate": false,
    "isRefund": false,
    "isFee": false,
    "isTransfer": false
  },
  "suggestedCategory": "Category name or null"
}`;

    return prompt;
  }
}

/**
 * Factory function to create row analyzer
 */
export function createRowAnalyzer(llmClient: LlmClient): AiRowAnalyzer {
  return new AiRowAnalyzer(llmClient);
}
