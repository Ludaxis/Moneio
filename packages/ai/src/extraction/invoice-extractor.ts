// Invoice extractor implementation
import type { AiEvidence, OcrPayload } from '@moneio/core-ledger';
import type { InvoiceExtraction } from '@moneio/domain';
import { invoiceExtractionSchema } from '@moneio/domain';

import type { AiProposal, ModelInfo, WorkspaceContext } from '../types.js';
import type { InvoiceExtractorAdapter } from './extractor.js';

export interface LlmClient {
  complete(prompt: string, schema?: unknown): Promise<string>;
  getModelInfo(): ModelInfo;
}

export class InvoiceExtractor implements InvoiceExtractorAdapter {
  constructor(private readonly llm: LlmClient) {}

  async extractInvoice(
    ocrPayload: OcrPayload,
    context: WorkspaceContext
  ): Promise<AiProposal<InvoiceExtraction>> {
    const prompt = this.buildPrompt(ocrPayload, context);
    const response = await this.llm.complete(prompt);

    // Parse and validate response
    const parsed = this.parseResponse(response);
    const validated = invoiceExtractionSchema.parse(parsed);

    // Calculate confidence based on fields extracted
    const confidence = this.calculateConfidence(validated);

    // Build evidence
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

    return `You are an expert invoice data extractor. Extract structured data from the following invoice document.

Document Text:
${fullText}

Context:
- Locale: ${context.locale}
- Expected Currency: ${context.baseCurrency}
- Known VAT Rates: ${context.vatRates?.join(', ') || 'standard rates'}

Extract the following fields as JSON:
- invoiceNumber: The invoice number/reference
- issueDate: Date in YYYY-MM-DD format
- dueDate: Due date in YYYY-MM-DD format (if present)
- vendorName: Name of the vendor/seller
- vendorAddress: Full address of the vendor
- vendorVatId: VAT/Tax ID of the vendor
- buyerName: Name of the buyer
- buyerAddress: Full address of the buyer
- buyerVatId: VAT/Tax ID of the buyer
- currency: ISO 4217 currency code (e.g., EUR, USD)
- subtotal: Subtotal amount before tax (as number)
- vatTotal: Total VAT/tax amount (as number)
- total: Total amount including tax (as number)
- lineItems: Array of line items with:
  - description: Item description
  - quantity: Quantity (as number)
  - unitPrice: Unit price (as number)
  - vatRate: VAT rate as decimal (e.g., 0.20 for 20%)
  - lineTotal: Line total (as number)

Return only valid JSON. Use null for fields that cannot be determined.`;
  }

  private parseResponse(response: string): unknown {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;

    try {
      const parsed = JSON.parse(jsonStr.trim());
      return { kind: 'invoice', ...parsed };
    } catch {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  private calculateConfidence(extraction: InvoiceExtraction): number {
    const requiredFields = ['vendorName', 'total', 'currency'];
    const optionalFields = [
      'invoiceNumber',
      'issueDate',
      'dueDate',
      'subtotal',
      'vatTotal',
      'lineItems',
    ];

    let score = 0;
    const maxScore = requiredFields.length * 20 + optionalFields.length * 10;

    // Required fields (20 points each)
    for (const field of requiredFields) {
      if (extraction[field as keyof InvoiceExtraction]) {
        score += 20;
      }
    }

    // Optional fields (10 points each)
    for (const field of optionalFields) {
      if (extraction[field as keyof InvoiceExtraction]) {
        score += 10;
      }
    }

    // Bonus for line items
    if (extraction.lineItems && extraction.lineItems.length > 0) {
      score += 10;
    }

    return Math.min(Math.round((score / maxScore) * 100), 100);
  }

  private buildEvidence(
    ocrPayload: OcrPayload,
    extraction: InvoiceExtraction
  ): AiEvidence[] {
    const evidence: AiEvidence[] = [];

    // Find evidence for key fields in OCR data
    for (const page of ocrPayload.pages) {
      for (const block of page.blocks) {
        // Check if block contains extracted values
        if (extraction.invoiceNumber && block.text.includes(extraction.invoiceNumber)) {
          evidence.push({
            page: page.pageNumber,
            boundingBox: block.boundingBox,
            sourceText: block.text,
            reasoning: 'Invoice number found in document',
          });
        }

        if (extraction.vendorName && block.text.includes(extraction.vendorName)) {
          evidence.push({
            page: page.pageNumber,
            boundingBox: block.boundingBox,
            sourceText: block.text,
            reasoning: 'Vendor name found in document',
          });
        }

        if (extraction.total) {
          const totalStr = extraction.total.toString();
          if (block.text.includes(totalStr)) {
            evidence.push({
              page: page.pageNumber,
              boundingBox: block.boundingBox,
              sourceText: block.text,
              reasoning: 'Total amount found in document',
            });
          }
        }
      }
    }

    return evidence;
  }
}
