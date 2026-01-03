// Receipt extractor implementation
import type { AiEvidence, OcrPayload } from '@moneio/core-ledger';
import type { ReceiptExtraction } from '@moneio/domain';
import { receiptExtractionSchema } from '@moneio/domain';

import type { AiProposal, WorkspaceContext } from '../types';
import { sanitizeOcrText } from '../utils/sanitize';

import type { ReceiptExtractorAdapter } from './extractor';
import type { LlmClient } from './invoice-extractor';

export class ReceiptExtractor implements ReceiptExtractorAdapter {
  constructor(private readonly llm: LlmClient) {}

  async extractReceipt(
    ocrPayload: OcrPayload,
    context: WorkspaceContext
  ): Promise<AiProposal<ReceiptExtraction>> {
    const prompt = this.buildPrompt(ocrPayload, context);
    const response = await this.llm.complete(prompt);

    const parsed = this.parseResponse(response);
    const validated = receiptExtractionSchema.parse(parsed);
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
    const rawText = ocrPayload.pages.map((p) => p.text).join('\n\n');

    // Sanitize OCR text to prevent prompt injection attacks
    const fullText = sanitizeOcrText(rawText);

    return `You are an expert receipt data extractor. Extract structured data from the following receipt.

Document Text:
${fullText}

Context:
- Locale: ${context.locale}
- Expected Currency: ${context.baseCurrency}
- Known VAT Rates: ${context.vatRates?.join(', ') || 'standard rates'}

Extract the following fields as JSON:
- merchantName: Name of the merchant/store
- merchantAddress: Address of the merchant
- date: Receipt date (YYYY-MM-DD)
- currency: ISO 4217 currency code
- subtotal: Subtotal before tax as number
- vatTotal: VAT/tax total as number
- total: Total amount as number
- paymentMethod: Payment method (cash, card, etc.)
- items: Array of purchased items with:
  - description: Item description
  - quantity: Quantity as number
  - unitPrice: Unit price as number
  - total: Item total as number

Return only valid JSON. Use null for fields that cannot be determined.`;
  }

  private parseResponse(response: string): unknown {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;

    try {
      const parsed = JSON.parse(jsonStr.trim());
      return { kind: 'receipt', ...parsed };
    } catch {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  private calculateConfidence(extraction: ReceiptExtraction): number {
    const fields = ['merchantName', 'date', 'currency', 'total', 'subtotal', 'vatTotal', 'items'];

    let score = 0;
    for (const field of fields) {
      if (extraction[field as keyof ReceiptExtraction]) {
        score += 14;
      }
    }

    if (extraction.items && extraction.items.length > 0) {
      score += 10;
    }

    return Math.min(Math.round(score), 100);
  }

  private buildEvidence(ocrPayload: OcrPayload, extraction: ReceiptExtraction): AiEvidence[] {
    const evidence: AiEvidence[] = [];

    for (const page of ocrPayload.pages) {
      for (const block of page.blocks) {
        if (extraction.merchantName && block.text.includes(extraction.merchantName)) {
          evidence.push({
            page: page.pageNumber,
            boundingBox: block.boundingBox,
            sourceText: block.text,
            reasoning: 'Merchant name found',
          });
        }

        if (extraction.total) {
          const totalStr = extraction.total.toString();
          if (block.text.includes(totalStr)) {
            evidence.push({
              page: page.pageNumber,
              boundingBox: block.boundingBox,
              sourceText: block.text,
              reasoning: 'Total amount found',
            });
          }
        }
      }
    }

    return evidence;
  }
}
