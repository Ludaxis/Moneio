// Invoice extractor implementation
import type { AiEvidence, OcrPayload } from '@moneio/core-ledger';
import type { InvoiceExtraction } from '@moneio/domain';
import { invoiceExtractionSchema } from '@moneio/domain';

import type { AiProposal, ModelInfo, WorkspaceContext } from '../types';

import type { InvoiceExtractorAdapter } from './extractor';

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

    // Check for empty OCR text
    if (!fullText || fullText.trim().length < 10) {
      throw new Error('Cannot extract invoice: OCR text is empty or too short');
    }

    console.log(`[InvoiceExtractor] OCR text length: ${fullText.length} chars`);
    console.log(`[InvoiceExtractor] OCR text preview: ${fullText.substring(0, 500)}...`);

    return `You are an expert invoice data extractor. Extract structured data ONLY from the document text provided below.

CRITICAL INSTRUCTIONS:
- ONLY extract data that is EXPLICITLY present in the document text below
- DO NOT make up, guess, or hallucinate any data
- If a field is not found in the text, use null
- Numbers should be extracted exactly as they appear (e.g., if the document says "€5000.00", extract 5000)
- Dates should be converted to YYYY-MM-DD format

=== DOCUMENT TEXT START ===
${fullText}
=== DOCUMENT TEXT END ===

Context:
- Locale: ${context.locale}
- Expected Currency: ${context.baseCurrency}

Extract these fields as JSON (use null if not found in the text):
{
  "invoiceNumber": "string or null - the invoice/reference number",
  "issueDate": "YYYY-MM-DD or null - when the invoice was issued",
  "dueDate": "YYYY-MM-DD or null - payment due date",
  "vendorName": "string or null - company/person who issued the invoice",
  "vendorAddress": "string or null - vendor's full address",
  "vendorVatId": "string or null - vendor's VAT/tax ID",
  "buyerName": "string or null - company/person being billed",
  "buyerAddress": "string or null - buyer's full address",
  "buyerVatId": "string or null - buyer's VAT/tax ID",
  "currency": "EUR/USD/GBP etc - currency code",
  "subtotal": "number or null - amount before tax",
  "vatTotal": "number or null - total tax amount",
  "total": "number - total amount due",
  "lineItems": [
    {
      "description": "string - item/service description",
      "quantity": "number",
      "unitPrice": "number",
      "vatRate": "number as decimal (0.20 for 20%)",
      "lineTotal": "number"
    }
  ]
}

Return ONLY valid JSON, no explanations.`;
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

  private buildEvidence(ocrPayload: OcrPayload, extraction: InvoiceExtraction): AiEvidence[] {
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
