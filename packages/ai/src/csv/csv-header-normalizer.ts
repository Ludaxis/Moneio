/**
 * CSV Header Normalizer - AI-powered column detection
 *
 * Uses LLM to translate and normalize CSV headers from any language
 * to standard English column names for bank transaction imports.
 */

import type { LlmClient } from '../extraction/invoice-extractor';

/**
 * Standard column mapping result
 */
export interface NormalizedColumnMapping {
  /** Original header from CSV */
  original: string;
  /** Normalized English name for bank transaction columns */
  normalized:
    | 'date'
    | 'description'
    | 'amount'
    | 'balance'
    | 'reference'
    | 'direction'
    | 'currency'
    | 'counterpartyName'
    | 'counterpartyAccount'
    | 'fee'
    | 'category'
    | 'status'
    | null;
  /** Confidence score 0-1 */
  confidence: number;
}

export interface CsvNormalizationResult {
  mappings: NormalizedColumnMapping[];
  /** Sample of first few data rows for context */
  detectedDelimiter: string;
  /** Detected language of headers */
  detectedLanguage?: string;
}

const NORMALIZATION_PROMPT = `You are analyzing CSV headers from a bank statement or financial document.

Your task is to map each header to ONE of these standard column types:
- "date": Transaction date (any format: DD-MM-YYYY, YYYY-MM-DD, etc.)
- "description": Transaction description, memo, narrative, explanation, details
- "amount": Transaction amount (can be positive/negative, or use direction column)
- "balance": Account balance after transaction
- "reference": Transaction reference number, ID, archive code, or document number
- "direction": Debit/Credit indicator (D/C, IN/OUT, DEBIT/CREDIT, +/-)
- "currency": Currency code (EUR, USD, etc.)
- "counterpartyName": Payee/payer name, merchant name, beneficiary, sender, recipient
- "counterpartyAccount": Payee/payer account number, IBAN
- "fee": Transaction fee, service charge, commission
- "category": Expense/income category (e.g., "Marketing", "Office expenses")
- "status": Transaction status (COMPLETED, PENDING, REFUNDED, etc.)
- null: If the column doesn't match any of these

Important rules:
1. Each standard type should only be assigned ONCE (pick the best match)
2. "amount" takes priority - if there are separate debit/credit columns, map the main amount column
3. "direction" is for D/C or IN/OUT indicators that determine the sign of the amount
4. "counterpartyName" is the OTHER party in the transaction (who you paid or received from)
5. "description" is the transaction narrative/details, NOT the counterparty name
6. Be language-agnostic - headers may be in Estonian, German, Dutch, Persian, etc.

Common header translations:
- Estonian: "Makse kuupäev"=date, "Selgitus"=description, "Summa"=amount, "Saaja/maksja nimi"=counterpartyName
- German: "Buchungstag"=date, "Verwendungszweck"=description, "Betrag"=amount, "Empfänger"=counterpartyName
- Wise format: "Created on"=date, "Target name"=counterpartyName, "Source amount"=amount, "Direction"=direction, "Category"=category, "Status"=status

Return a JSON object with this exact structure:
{
  "mappings": [
    { "original": "header1", "normalized": "date", "confidence": 0.95 },
    { "original": "header2", "normalized": "counterpartyName", "confidence": 0.9 },
    ...
  ],
  "detectedLanguage": "Estonian"
}

CSV Headers to analyze:
`;

/**
 * Normalize CSV headers using AI
 */
export class CsvHeaderNormalizer {
  constructor(private readonly llmClient: LlmClient) {}

  /**
   * Normalize CSV headers to standard column names
   *
   * @param headers - Raw CSV headers from the file
   * @param sampleRows - Optional sample data rows for context
   * @returns Normalized column mappings
   */
  async normalizeHeaders(
    headers: string[],
    sampleRows?: string[][]
  ): Promise<CsvNormalizationResult> {
    // Build prompt with headers and sample data
    let prompt = NORMALIZATION_PROMPT + JSON.stringify(headers);

    if (sampleRows && sampleRows.length > 0) {
      prompt += '\n\nSample data rows (for context):\n';
      prompt += sampleRows
        .slice(0, 3)
        .map((row) => JSON.stringify(row))
        .join('\n');
    }

    try {
      const response = await this.llmClient.complete(prompt);
      const parsed = JSON.parse(response);

      // Validate and clean up response
      const mappings: NormalizedColumnMapping[] = headers.map((header) => {
        const found = parsed.mappings?.find(
          (m: NormalizedColumnMapping) =>
            m.original.toLowerCase().trim() === header.toLowerCase().trim()
        );

        if (found && isValidNormalizedType(found.normalized)) {
          return {
            original: header,
            normalized: found.normalized,
            confidence: Math.min(1, Math.max(0, found.confidence || 0.5)),
          };
        }

        return {
          original: header,
          normalized: null,
          confidence: 0,
        };
      });

      // Ensure uniqueness - only one column per type
      const usedTypes = new Set<string>();
      const finalMappings: NormalizedColumnMapping[] = mappings.map((m) => {
        if (m.normalized && usedTypes.has(m.normalized)) {
          // Duplicate - unmap the lower confidence one
          return { original: m.original, normalized: null, confidence: 0 };
        }
        if (m.normalized) {
          usedTypes.add(m.normalized);
        }
        return m;
      });

      return {
        mappings: finalMappings,
        detectedDelimiter: ',', // Could be enhanced to detect
        detectedLanguage: parsed.detectedLanguage,
      };
    } catch (error) {
      console.error('Failed to normalize CSV headers with AI:', error);

      // Return empty mappings on failure - let user map manually
      return {
        mappings: headers.map((header) => ({
          original: header,
          normalized: null,
          confidence: 0,
        })),
        detectedDelimiter: ',',
      };
    }
  }
}

/**
 * Type guard for valid normalized column types
 */
function isValidNormalizedType(value: unknown): value is NormalizedColumnMapping['normalized'] {
  return (
    value === null ||
    value === 'date' ||
    value === 'description' ||
    value === 'amount' ||
    value === 'balance' ||
    value === 'reference' ||
    value === 'direction' ||
    value === 'currency' ||
    value === 'counterpartyName' ||
    value === 'counterpartyAccount' ||
    value === 'fee' ||
    value === 'category' ||
    value === 'status'
  );
}
