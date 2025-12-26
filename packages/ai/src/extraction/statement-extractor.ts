// Statement extractor implementation
import type { AiEvidence, OcrPayload } from '@moneio/core-ledger';
import type { StatementExtraction } from '@moneio/domain';
import { statementExtractionSchema } from '@moneio/domain';

import type { AiProposal, WorkspaceContext } from '../types.js';

import type { StatementExtractorAdapter } from './extractor.js';
import type { LlmClient } from './invoice-extractor.js';

export class StatementExtractor implements StatementExtractorAdapter {
  constructor(private readonly llm: LlmClient) {}

  async extractStatement(
    ocrPayload: OcrPayload,
    context: WorkspaceContext
  ): Promise<AiProposal<StatementExtraction>> {
    const prompt = this.buildPrompt(ocrPayload, context);
    const response = await this.llm.complete(prompt);

    const parsed = this.parseResponse(response);
    const validated = statementExtractionSchema.parse(parsed);
    const confidence = this.calculateConfidence(validated);
    const evidence = this.buildEvidence(ocrPayload, validated);

    return {
      data: validated,
      confidence,
      evidence,
      modelInfo: this.llm.getModelInfo(),
    };
  }

  private buildPrompt(ocrPayload: OcrPayload, context: WorkspaceContext): string {
    const fullText = ocrPayload.pages.map((p) => p.text).join('\n\n');

    return `You are an expert bank statement data extractor. Extract structured data from the following bank statement.

Document Text:
${fullText}

Context:
- Locale: ${context.locale}
- Expected Currency: ${context.baseCurrency}

Extract the following fields as JSON:
- accountNumber: The account number
- accountName: Name on the account
- bankName: Name of the bank
- iban: IBAN if present
- currency: ISO 4217 currency code
- periodStart: Statement period start date (YYYY-MM-DD)
- periodEnd: Statement period end date (YYYY-MM-DD)
- openingBalance: Opening balance as number
- closingBalance: Closing balance as number
- transactions: Array of transactions with:
  - date: Transaction date (YYYY-MM-DD)
  - description: Transaction description
  - amount: Amount as number (negative for debits)
  - balance: Running balance after transaction (if available)
  - reference: Transaction reference (if available)

Return only valid JSON. Use null for fields that cannot be determined.`;
  }

  private parseResponse(response: string): unknown {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;

    try {
      const parsed = JSON.parse(jsonStr.trim());
      return { kind: 'statement', ...parsed };
    } catch {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  private calculateConfidence(extraction: StatementExtraction): number {
    const fields = [
      'accountNumber',
      'bankName',
      'currency',
      'periodStart',
      'periodEnd',
      'openingBalance',
      'closingBalance',
      'transactions',
    ];

    let score = 0;
    for (const field of fields) {
      if (extraction[field as keyof StatementExtraction]) {
        score += 12.5;
      }
    }

    if (extraction.transactions && extraction.transactions.length > 0) {
      score += 10;
    }

    return Math.min(Math.round(score), 100);
  }

  private buildEvidence(
    ocrPayload: OcrPayload,
    extraction: StatementExtraction
  ): AiEvidence[] {
    const evidence: AiEvidence[] = [];

    for (const page of ocrPayload.pages) {
      for (const block of page.blocks) {
        if (extraction.accountNumber && block.text.includes(extraction.accountNumber)) {
          evidence.push({
            page: page.pageNumber,
            boundingBox: block.boundingBox,
            sourceText: block.text,
            reasoning: 'Account number found',
          });
        }

        if (extraction.bankName && block.text.includes(extraction.bankName)) {
          evidence.push({
            page: page.pageNumber,
            boundingBox: block.boundingBox,
            sourceText: block.text,
            reasoning: 'Bank name found',
          });
        }
      }
    }

    return evidence;
  }
}
