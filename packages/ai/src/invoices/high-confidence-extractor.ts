/**
 * High-Confidence Invoice Extractor
 *
 * Multi-stage extraction pipeline designed to maximize accuracy:
 * 1. OCR text extraction
 * 2. LLM-based field extraction
 * 3. Cross-field validation
 * 4. Confidence scoring per field
 * 5. Auto-approve high confidence, flag low confidence for review
 */

import type { LlmClient } from '../extraction/invoice-extractor';
import type { ModelInfo } from '../types';

/**
 * Extracted invoice field with confidence
 */
export interface ExtractedField<T> {
  value: T | null;
  confidence: number; // 0-100
  source: 'ocr' | 'llm' | 'validation' | 'inferred';
  evidence?: string; // Text snippet that supports this value
  needsReview: boolean;
}

/**
 * Complete invoice extraction result
 */
export interface InvoiceExtraction {
  // Document classification
  documentType: ExtractedField<'invoice' | 'receipt' | 'credit_note' | 'quote'>;
  flowType: ExtractedField<'expense' | 'revenue'>; // Are we paying or receiving?

  // Core fields
  invoiceNumber: ExtractedField<string>;
  invoiceDate: ExtractedField<string>; // ISO date
  dueDate: ExtractedField<string | null>;

  // Parties
  vendor: ExtractedField<{
    name: string;
    taxId?: string;
    address?: string;
    email?: string;
  }>;
  customer: ExtractedField<{
    name: string;
    taxId?: string;
    address?: string;
  }>;

  // Amounts
  subtotal: ExtractedField<number>;
  taxAmount: ExtractedField<number>;
  taxRate: ExtractedField<number | null>; // Percentage
  totalAmount: ExtractedField<number>;
  currency: ExtractedField<string>;

  // Line items
  lineItems: ExtractedField<
    Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      amount: number;
      taxRate?: number;
    }>
  >;

  // Categorization
  suggestedCategory: ExtractedField<{
    id: string;
    name: string;
    reasoning: string;
  } | null>;

  // Overall metrics
  overallConfidence: number;
  needsHumanReview: boolean;
  reviewReasons: string[];

  // Metadata
  processingTimeMs: number;
  modelInfo: ModelInfo;
}

/**
 * Validation rules for cross-field checks
 */
interface ValidationRule {
  name: string;
  validate: (extraction: Partial<InvoiceExtraction>) => {
    valid: boolean;
    message?: string;
    adjustment?: Partial<InvoiceExtraction>;
  };
}

/**
 * Configuration for the extractor
 */
export interface ExtractorConfig {
  /** Minimum confidence to auto-approve (0-100) */
  autoApproveThreshold: number;

  /** Minimum confidence to accept a field (0-100) */
  fieldAcceptThreshold: number;

  /** Enable strict validation rules */
  strictValidation: boolean;

  /** Available categories for classification */
  categories: Array<{ id: string; name: string; type: 'expense' | 'revenue' }>;

  /** Known vendors for matching */
  knownVendors?: Array<{ name: string; patterns: string[]; defaultCategory?: string }>;
}

/**
 * Default configuration
 */
export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  autoApproveThreshold: 90,
  fieldAcceptThreshold: 70,
  strictValidation: true,
  categories: [],
};

/**
 * High-confidence invoice extractor
 */
export class HighConfidenceExtractor {
  private readonly config: ExtractorConfig;
  private readonly validationRules: ValidationRule[];

  constructor(
    private readonly llmClient: LlmClient,
    config: Partial<ExtractorConfig> = {}
  ) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config };
    this.validationRules = this.createValidationRules();
  }

  /**
   * Extract invoice data with high confidence
   */
  async extract(
    ocrText: string,
    options?: {
      fileName?: string;
      mimeType?: string;
      workspaceContext?: {
        companyName?: string;
        taxId?: string;
        recentVendors?: string[];
      };
    }
  ): Promise<InvoiceExtraction> {
    const startTime = Date.now();

    // Stage 1: Initial LLM extraction
    const rawExtraction = await this.performLlmExtraction(ocrText, options);

    // Stage 2: Apply validation rules and adjust confidence
    const validatedExtraction = this.applyValidation(rawExtraction);

    // Stage 3: Determine revenue vs expense
    const classifiedExtraction = this.classifyFlowType(validatedExtraction, options);

    // Stage 4: Match category
    const categorizedExtraction = await this.matchCategory(classifiedExtraction);

    // Stage 5: Calculate overall confidence and review needs
    const finalExtraction = this.calculateOverallConfidence(categorizedExtraction);

    finalExtraction.processingTimeMs = Date.now() - startTime;
    finalExtraction.modelInfo = this.llmClient.getModelInfo();

    return finalExtraction;
  }

  /**
   * Stage 1: LLM-based extraction
   */
  private async performLlmExtraction(
    ocrText: string,
    options?: { workspaceContext?: { companyName?: string } }
  ): Promise<Partial<InvoiceExtraction>> {
    const prompt = this.buildExtractionPrompt(ocrText, options);
    const response = await this.llmClient.complete(prompt);

    try {
      const parsed = this.parseResponse(response);
      return this.normalizeExtraction(parsed);
    } catch (error) {
      console.error('[HighConfidenceExtractor] Parse error:', error);
      return this.createEmptyExtraction();
    }
  }

  /**
   * Build extraction prompt
   */
  private buildExtractionPrompt(
    ocrText: string,
    options?: { workspaceContext?: { companyName?: string } }
  ): string {
    const companyContext = options?.workspaceContext?.companyName
      ? `\nIMPORTANT: The user's company is "${options.workspaceContext.companyName}". If this company appears as the CUSTOMER/BUYER, this is an EXPENSE. If it appears as the VENDOR/SELLER, this is REVENUE.`
      : '';

    return `You are an expert invoice data extractor. Extract ALL fields from this invoice with high precision.

${companyContext}

INVOICE TEXT:
"""
${ocrText.slice(0, 8000)}
"""

Extract the following fields. For each field, provide:
- value: the extracted value
- confidence: your confidence 0-100 (be honest, lower if uncertain)
- evidence: the exact text snippet that supports this value

CRITICAL RULES:
1. Numbers must be parsed correctly - watch for European format (1.234,56) vs American (1,234.56)
2. Dates should be ISO format (YYYY-MM-DD)
3. If a field is not found, set value to null and confidence to 0
4. Tax calculations: verify that subtotal + taxAmount = totalAmount (within rounding)
5. Line items should sum to subtotal
6. Be VERY careful with:
   - Distinguishing vendor vs customer
   - Tax ID formats (varies by country)
   - Currency symbols and codes

Return valid JSON only:
{
  "documentType": { "value": "invoice|receipt|credit_note|quote", "confidence": 0-100, "evidence": "..." },
  "invoiceNumber": { "value": "...", "confidence": 0-100, "evidence": "..." },
  "invoiceDate": { "value": "YYYY-MM-DD", "confidence": 0-100, "evidence": "..." },
  "dueDate": { "value": "YYYY-MM-DD or null", "confidence": 0-100, "evidence": "..." },
  "vendor": {
    "value": { "name": "...", "taxId": "...", "address": "...", "email": "..." },
    "confidence": 0-100,
    "evidence": "..."
  },
  "customer": {
    "value": { "name": "...", "taxId": "...", "address": "..." },
    "confidence": 0-100,
    "evidence": "..."
  },
  "subtotal": { "value": 123.45, "confidence": 0-100, "evidence": "..." },
  "taxAmount": { "value": 12.34, "confidence": 0-100, "evidence": "..." },
  "taxRate": { "value": 20, "confidence": 0-100, "evidence": "..." },
  "totalAmount": { "value": 135.79, "confidence": 0-100, "evidence": "..." },
  "currency": { "value": "EUR", "confidence": 0-100, "evidence": "..." },
  "lineItems": {
    "value": [
      { "description": "...", "quantity": 1, "unitPrice": 100, "amount": 100 }
    ],
    "confidence": 0-100,
    "evidence": "..."
  }
}`;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(response: string): Record<string, unknown> {
    // Handle markdown code blocks
    let jsonStr = response.trim();
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Find JSON object
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonStr = braceMatch[0];
    }

    return JSON.parse(jsonStr);
  }

  /**
   * Normalize raw extraction to typed structure
   */
  private normalizeExtraction(raw: Record<string, unknown>): Partial<InvoiceExtraction> {
    const getField = <T>(field: unknown, defaultValue: T | null = null): ExtractedField<T> => {
      if (!field || typeof field !== 'object') {
        return {
          value: defaultValue,
          confidence: 0,
          source: 'llm',
          needsReview: true,
        };
      }

      const f = field as Record<string, unknown>;
      const confidence = typeof f.confidence === 'number' ? f.confidence : 0;

      return {
        value: (f.value as T) ?? defaultValue,
        confidence,
        source: 'llm',
        evidence: typeof f.evidence === 'string' ? f.evidence : undefined,
        needsReview: confidence < this.config.fieldAcceptThreshold,
      };
    };

    return {
      documentType: getField<'invoice' | 'receipt' | 'credit_note' | 'quote'>(
        raw.documentType,
        'invoice'
      ),
      invoiceNumber: getField<string>(raw.invoiceNumber),
      invoiceDate: getField<string>(raw.invoiceDate),
      dueDate: getField<string | null>(raw.dueDate),
      vendor: getField(raw.vendor),
      customer: getField(raw.customer),
      subtotal: getField<number>(raw.subtotal, 0),
      taxAmount: getField<number>(raw.taxAmount, 0),
      taxRate: getField<number | null>(raw.taxRate),
      totalAmount: getField<number>(raw.totalAmount, 0),
      currency: getField<string>(raw.currency, 'EUR'),
      lineItems: getField(raw.lineItems, []),
    };
  }

  /**
   * Create empty extraction result
   */
  private createEmptyExtraction(): Partial<InvoiceExtraction> {
    const emptyField = <T>(value: T | null = null): ExtractedField<T> => ({
      value,
      confidence: 0,
      source: 'llm',
      needsReview: true,
    });

    return {
      documentType: emptyField('invoice'),
      invoiceNumber: emptyField(),
      invoiceDate: emptyField(),
      dueDate: emptyField(),
      vendor: emptyField(),
      customer: emptyField(),
      subtotal: emptyField(0),
      taxAmount: emptyField(0),
      taxRate: emptyField(),
      totalAmount: emptyField(0),
      currency: emptyField('EUR'),
      lineItems: emptyField([]),
    };
  }

  /**
   * Stage 2: Apply validation rules
   */
  private applyValidation(extraction: Partial<InvoiceExtraction>): Partial<InvoiceExtraction> {
    const result = { ...extraction };
    const reviewReasons: string[] = [];

    for (const rule of this.validationRules) {
      const { valid, message, adjustment } = rule.validate(result);

      if (!valid && message) {
        reviewReasons.push(message);
      }

      if (adjustment) {
        Object.assign(result, adjustment);
      }
    }

    (result as InvoiceExtraction).reviewReasons = reviewReasons;
    return result;
  }

  /**
   * Create validation rules
   */
  private createValidationRules(): ValidationRule[] {
    return [
      // Rule 1: Total = Subtotal + Tax (within tolerance)
      {
        name: 'total_calculation',
        validate: (ext) => {
          const subtotal = ext.subtotal?.value ?? 0;
          const tax = ext.taxAmount?.value ?? 0;
          const total = ext.totalAmount?.value ?? 0;

          const calculated = subtotal + tax;
          const diff = Math.abs(calculated - total);
          const tolerance = Math.max(0.02, total * 0.001); // 0.1% or 2 cents

          if (diff > tolerance && total > 0) {
            // Adjust confidence if mismatch
            return {
              valid: false,
              message: `Total mismatch: ${subtotal} + ${tax} = ${calculated}, but total is ${total}`,
              adjustment: {
                totalAmount: {
                  ...ext.totalAmount!,
                  confidence: Math.max(0, (ext.totalAmount?.confidence ?? 0) - 20),
                  needsReview: true,
                },
              },
            };
          }

          return { valid: true };
        },
      },

      // Rule 2: Line items should sum to subtotal
      {
        name: 'lineitem_sum',
        validate: (ext) => {
          const lineItems = ext.lineItems?.value ?? [];
          if (lineItems.length === 0) return { valid: true };

          const lineSum = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
          const subtotal = ext.subtotal?.value ?? 0;
          const diff = Math.abs(lineSum - subtotal);

          if (diff > 0.1 && subtotal > 0) {
            return {
              valid: false,
              message: `Line items sum (${lineSum.toFixed(2)}) doesn't match subtotal (${subtotal.toFixed(2)})`,
              adjustment: {
                lineItems: {
                  ...ext.lineItems!,
                  confidence: Math.max(0, (ext.lineItems?.confidence ?? 0) - 15),
                  needsReview: true,
                },
              },
            };
          }

          return { valid: true };
        },
      },

      // Rule 3: Tax rate validation
      {
        name: 'tax_rate',
        validate: (ext) => {
          const subtotal = ext.subtotal?.value ?? 0;
          const tax = ext.taxAmount?.value ?? 0;
          const declaredRate = ext.taxRate?.value;

          if (subtotal === 0) return { valid: true };

          const calculatedRate = (tax / subtotal) * 100;

          // Common tax rates
          const commonRates = [0, 5, 6, 7, 9, 10, 12, 13, 19, 20, 21, 22, 23, 25, 27];
          const nearestCommon = commonRates.reduce((prev, curr) =>
            Math.abs(curr - calculatedRate) < Math.abs(prev - calculatedRate) ? curr : prev
          );

          if (declaredRate && Math.abs(declaredRate - calculatedRate) > 1) {
            return {
              valid: false,
              message: `Declared tax rate (${declaredRate}%) doesn't match calculated (${calculatedRate.toFixed(1)}%)`,
              adjustment: {
                taxRate: {
                  value: nearestCommon,
                  confidence: 60,
                  source: 'validation',
                  needsReview: true,
                },
              },
            };
          }

          // Infer tax rate if not provided
          if (!declaredRate && tax > 0) {
            return {
              valid: true,
              adjustment: {
                taxRate: {
                  value: nearestCommon,
                  confidence: 75,
                  source: 'inferred',
                  needsReview: false,
                },
              },
            };
          }

          return { valid: true };
        },
      },

      // Rule 4: Date validation
      {
        name: 'date_validity',
        validate: (ext) => {
          const invoiceDate = ext.invoiceDate?.value;
          const dueDate = ext.dueDate?.value;

          if (invoiceDate) {
            const date = new Date(invoiceDate);
            const now = new Date();
            const twoYearsAgo = new Date(now.getFullYear() - 2, 0, 1);

            if (date > now) {
              return {
                valid: false,
                message: 'Invoice date is in the future',
                adjustment: {
                  invoiceDate: {
                    ...ext.invoiceDate!,
                    confidence: Math.max(0, (ext.invoiceDate?.confidence ?? 0) - 30),
                    needsReview: true,
                  },
                },
              };
            }

            if (date < twoYearsAgo) {
              return {
                valid: false,
                message: 'Invoice date is more than 2 years old',
                adjustment: {
                  invoiceDate: {
                    ...ext.invoiceDate!,
                    needsReview: true,
                  },
                },
              };
            }
          }

          if (dueDate && invoiceDate) {
            const invoice = new Date(invoiceDate);
            const due = new Date(dueDate);

            if (due < invoice) {
              return {
                valid: false,
                message: 'Due date is before invoice date',
                adjustment: {
                  dueDate: {
                    ...ext.dueDate!,
                    confidence: Math.max(0, (ext.dueDate?.confidence ?? 0) - 25),
                    needsReview: true,
                  },
                },
              };
            }
          }

          return { valid: true };
        },
      },

      // Rule 5: Currency validation
      {
        name: 'currency',
        validate: (ext) => {
          const currency = ext.currency?.value;
          const validCurrencies = [
            'EUR',
            'USD',
            'GBP',
            'CHF',
            'SEK',
            'NOK',
            'DKK',
            'PLN',
            'CZK',
            'HUF',
            'RON',
            'BGN',
            'HRK',
            'RUB',
            'UAH',
            'TRY',
            'JPY',
            'CNY',
            'INR',
            'AUD',
            'CAD',
            'NZD',
            'SGD',
            'HKD',
            'KRW',
            'MXN',
            'BRL',
            'ZAR',
            'AED',
            'SAR',
          ];

          if (currency && !validCurrencies.includes(currency.toUpperCase())) {
            return {
              valid: false,
              message: `Unknown currency: ${currency}`,
              adjustment: {
                currency: {
                  ...ext.currency!,
                  confidence: Math.max(0, (ext.currency?.confidence ?? 0) - 20),
                  needsReview: true,
                },
              },
            };
          }

          return { valid: true };
        },
      },
    ];
  }

  /**
   * Stage 3: Classify as revenue or expense
   */
  private classifyFlowType(
    extraction: Partial<InvoiceExtraction>,
    options?: { workspaceContext?: { companyName?: string; taxId?: string } }
  ): Partial<InvoiceExtraction> {
    const result = { ...extraction };
    const vendorName = extraction.vendor?.value?.name?.toLowerCase() ?? '';
    const customerName = extraction.customer?.value?.name?.toLowerCase() ?? '';
    const companyName = options?.workspaceContext?.companyName?.toLowerCase() ?? '';
    const companyTaxId = options?.workspaceContext?.taxId ?? '';

    let flowType: 'expense' | 'revenue' = 'expense';
    let confidence = 60;
    let evidence = '';

    // Check if company appears as vendor (revenue) or customer (expense)
    if (companyName) {
      if (vendorName.includes(companyName) || companyName.includes(vendorName)) {
        flowType = 'revenue';
        confidence = 90;
        evidence = `Company "${companyName}" appears as vendor`;
      } else if (customerName.includes(companyName) || companyName.includes(customerName)) {
        flowType = 'expense';
        confidence = 90;
        evidence = `Company "${companyName}" appears as customer`;
      }
    }

    // Check tax ID match
    if (companyTaxId) {
      const vendorTaxId = extraction.vendor?.value?.taxId ?? '';
      const customerTaxId = extraction.customer?.value?.taxId ?? '';

      if (vendorTaxId === companyTaxId) {
        flowType = 'revenue';
        confidence = 95;
        evidence = 'Company tax ID matches vendor';
      } else if (customerTaxId === companyTaxId) {
        flowType = 'expense';
        confidence = 95;
        evidence = 'Company tax ID matches customer';
      }
    }

    // Document type hints
    if (extraction.documentType?.value === 'credit_note') {
      // Credit notes are typically refunds
      flowType = flowType === 'expense' ? 'revenue' : 'expense'; // Reversal
      evidence += ' (credit note reverses direction)';
    }

    result.flowType = {
      value: flowType,
      confidence,
      source: 'inferred',
      evidence,
      needsReview: confidence < this.config.autoApproveThreshold,
    };

    return result;
  }

  /**
   * Stage 4: Match to category
   */
  private async matchCategory(
    extraction: Partial<InvoiceExtraction>
  ): Promise<Partial<InvoiceExtraction>> {
    const result = { ...extraction };

    if (this.config.categories.length === 0) {
      result.suggestedCategory = {
        value: null,
        confidence: 0,
        source: 'llm',
        needsReview: false,
      };
      return result;
    }

    const flowType = extraction.flowType?.value ?? 'expense';
    const relevantCategories = this.config.categories.filter(
      (c) => c.type === flowType || c.type === (flowType === 'expense' ? 'expense' : 'revenue')
    );

    if (relevantCategories.length === 0) {
      result.suggestedCategory = {
        value: null,
        confidence: 0,
        source: 'llm',
        needsReview: true,
      };
      return result;
    }

    // Check known vendors first
    const vendorName = extraction.vendor?.value?.name?.toLowerCase() ?? '';
    const knownVendor = this.config.knownVendors?.find((v) =>
      v.patterns.some((p) => vendorName.includes(p.toLowerCase()))
    );

    if (knownVendor?.defaultCategory) {
      const category = relevantCategories.find((c) => c.id === knownVendor.defaultCategory);
      if (category) {
        result.suggestedCategory = {
          value: {
            id: category.id,
            name: category.name,
            reasoning: `Matched known vendor: ${knownVendor.name}`,
          },
          confidence: 95,
          source: 'inferred',
          needsReview: false,
        };
        return result;
      }
    }

    // Use LLM for category matching
    const categoryPrompt = `Based on this invoice, select the most appropriate category.

Vendor: ${extraction.vendor?.value?.name ?? 'Unknown'}
Description: ${extraction.lineItems?.value?.map((i) => i.description).join(', ') ?? 'No line items'}
Total: ${extraction.totalAmount?.value ?? 0} ${extraction.currency?.value ?? 'EUR'}
Type: ${flowType.toUpperCase()}

Categories:
${relevantCategories.map((c) => `- ${c.id}: ${c.name}`).join('\n')}

Return JSON: { "categoryId": "...", "confidence": 0-100, "reasoning": "..." }`;

    try {
      const response = await this.llmClient.complete(categoryPrompt);
      const parsed = this.parseResponse(response);

      const categoryId = parsed.categoryId as string;
      const category = relevantCategories.find((c) => c.id === categoryId);

      if (category) {
        result.suggestedCategory = {
          value: {
            id: category.id,
            name: category.name,
            reasoning: (parsed.reasoning as string) ?? 'AI categorization',
          },
          confidence: Math.min(90, (parsed.confidence as number) ?? 70),
          source: 'llm',
          needsReview: ((parsed.confidence as number) ?? 70) < this.config.fieldAcceptThreshold,
        };
      }
    } catch (error) {
      console.error('[HighConfidenceExtractor] Category matching error:', error);
      result.suggestedCategory = {
        value: null,
        confidence: 0,
        source: 'llm',
        needsReview: true,
      };
    }

    return result;
  }

  /**
   * Stage 5: Calculate overall confidence
   */
  private calculateOverallConfidence(extraction: Partial<InvoiceExtraction>): InvoiceExtraction {
    const fields = [
      extraction.invoiceNumber,
      extraction.invoiceDate,
      extraction.vendor,
      extraction.totalAmount,
      extraction.currency,
      extraction.flowType,
    ];

    // Weight important fields more heavily
    const weights = [1, 1.5, 1.5, 2, 1, 1.5];
    let weightedSum = 0;
    let totalWeight = 0;

    fields.forEach((field, idx) => {
      if (field) {
        weightedSum += field.confidence * weights[idx];
        totalWeight += weights[idx];
      }
    });

    const overallConfidence = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    // Collect review reasons
    const reviewReasons: string[] = [...((extraction as InvoiceExtraction).reviewReasons ?? [])];

    const fieldsNeedingReview = [
      { name: 'Invoice Number', field: extraction.invoiceNumber },
      { name: 'Invoice Date', field: extraction.invoiceDate },
      { name: 'Vendor', field: extraction.vendor },
      { name: 'Total Amount', field: extraction.totalAmount },
      { name: 'Flow Type', field: extraction.flowType },
      { name: 'Category', field: extraction.suggestedCategory },
    ].filter((f) => f.field?.needsReview);

    if (fieldsNeedingReview.length > 0) {
      reviewReasons.push(
        `Low confidence fields: ${fieldsNeedingReview.map((f) => f.name).join(', ')}`
      );
    }

    const needsHumanReview =
      overallConfidence < this.config.autoApproveThreshold || reviewReasons.length > 0;

    return {
      ...(extraction as InvoiceExtraction),
      overallConfidence,
      needsHumanReview,
      reviewReasons,
      processingTimeMs: 0,
      modelInfo: this.llmClient.getModelInfo(),
    };
  }
}

/**
 * Create high-confidence extractor
 */
export function createHighConfidenceExtractor(
  llmClient: LlmClient,
  config?: Partial<ExtractorConfig>
): HighConfidenceExtractor {
  return new HighConfidenceExtractor(llmClient, config);
}
