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

const NORMALIZATION_PROMPT = `You are an expert at analyzing CSV bank statements from ANY country and language.

CRITICAL: Analyze BOTH the headers AND the sample data values to determine column types. Headers may be corrupted, misspelled, or in any language - USE THE DATA to verify!

Map each column to ONE of these types:
- "date": Contains dates (look for patterns like DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY, timestamps)
- "description": Transaction narrative, memo, details, explanation text
- "amount": Contains monetary values (numbers with decimals, may use comma as decimal separator like "224,75")
- "balance": Running account balance after transaction
- "reference": Transaction ID, reference number, archive code (long alphanumeric strings)
- "direction": Debit/Credit indicator (D/C, IN/OUT, DEBIT/CREDIT)
- "currency": Currency codes (EUR, USD, GBP) or symbols
- "counterpartyName": Names of people, companies, merchants (Apple Inc, Google, MAKSU- JA TOLLIAMET)
- "counterpartyAccount": IBAN or account numbers (start with country code like EE, DE, GB, or are long numbers)
- "fee": Transaction fees (usually small decimal amounts)
- "category": Expense categories (Marketing, Software, Office expenses)
- "status": Transaction status (COMPLETED, PENDING, REFUNDED)
- null: Column doesn't match any type

DETECTION STRATEGY:
1. If header is unclear or corrupted, LOOK AT THE DATA VALUES
2. Dates: Values like "01-01-2025", "2025-01-01", "01.01.2025"
3. Amounts: Values like "-224,75", "422.37", "-305,00" (numbers with 2 decimal places)
4. IBANs: Start with 2 letters + 2 digits (EE72..., GB29..., LT57...)
5. Names: Mixed case words, company names (Apple Inc, Google Ireland Limited)
6. Direction: Single letters D/C or words IN/OUT
7. Currency: 3-letter codes (EUR, USD) usually in their own column

CRITICAL RULES:
- Each type should only be assigned ONCE
- ALWAYS identify date, amount, and at least one text field (description or counterpartyName)
- If headers look corrupted (strange characters like �), rely MORE on sample data analysis
- Use high confidence (0.9+) when data clearly matches the pattern

Return JSON:
{
  "mappings": [
    { "original": "exact header text", "normalized": "date", "confidence": 0.95 },
    ...
  ],
  "detectedLanguage": "Estonian"
}

Headers and sample data:
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
    // Build a clear table format for the AI to analyze
    let prompt = NORMALIZATION_PROMPT;

    // Format as a table so AI can see headers aligned with data
    prompt += '\nHEADERS: ' + JSON.stringify(headers);

    if (sampleRows && sampleRows.length > 0) {
      prompt += '\n\nSAMPLE DATA (columns aligned with headers above):';
      // Show each row with column index for clarity
      sampleRows.slice(0, 5).forEach((row, rowIdx) => {
        prompt += `\nRow ${rowIdx + 1}: `;
        headers.forEach((_header, colIdx) => {
          const value = row[colIdx] || '(empty)';
          prompt += `[${colIdx}]${value} | `;
        });
      });

      // Also show column-by-column view for better pattern detection
      prompt += '\n\nCOLUMN-BY-COLUMN VIEW:';
      headers.forEach((header, colIdx) => {
        const values = sampleRows.slice(0, 5).map((row) => row[colIdx] || '(empty)');
        prompt += `\nColumn ${colIdx} "${header}": ${JSON.stringify(values)}`;
      });
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
