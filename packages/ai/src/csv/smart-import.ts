/**
 * Smart CSV Import - Unified integration of AI-powered import components
 *
 * Combines:
 * - Row Analyzer: Filters out turnover/summary rows
 * - Header Learner: Learns from user corrections
 * - Stream Categorizer: Categorizes rows as they're processed
 * - CSV Header Normalizer: AI-powered header detection
 *
 * This module provides a unified interface for intelligent CSV import.
 */

import type { LlmClient } from '../extraction/invoice-extractor';
import type { ModelInfo } from '../types';

import { CsvHeaderNormalizer, type CsvNormalizationResult } from './csv-header-normalizer';
import { HeaderLearner, InMemoryHeaderLearningStore, type HeaderLearningStore } from './header-learner';
import { AiRowAnalyzer, type RowAnalysis, type RowAnalysisContext } from './row-analyzer';
import {
  StreamCategorizer,
  type CategoryDefinition,
  type CategoryRule,
  type RowCategorizationResult,
} from './stream-categorizer';

/**
 * Configuration for smart import
 */
export interface SmartImportConfig {
  /** Workspace ID for learning storage */
  workspaceId: string;

  /** Available categories */
  categories: CategoryDefinition[];

  /** Categorization rules */
  rules?: CategoryRule[];

  /** Locale for pattern matching */
  locale?: string;

  /** Custom header learning store */
  headerLearningStore?: HeaderLearningStore;

  /** Enable AI for row analysis */
  enableAiRowAnalysis?: boolean;

  /** Enable AI for categorization */
  enableAiCategorization?: boolean;

  /** Minimum AI confidence threshold */
  minAiConfidence?: number;
}

/**
 * Result of processing a single row
 */
export interface ProcessedRow {
  /** Original row data */
  original: Record<string, string>;

  /** Whether this row should be imported as a transaction */
  isTransaction: boolean;

  /** Row analysis result */
  analysis: RowAnalysis;

  /** Categorization result (if row is a transaction) */
  categorization?: RowCategorizationResult;

  /** Extracted transaction data */
  transaction?: {
    date: string;
    description: string;
    amount: number;
    balance?: number;
    reference?: string;
    categoryId?: string;
    categoryName?: string;
  };
}

/**
 * Result of smart import processing
 */
export interface SmartImportResult {
  /** Normalized header mappings */
  headerMappings: CsvNormalizationResult;

  /** All processed rows */
  rows: ProcessedRow[];

  /** Valid transactions (filtered) */
  transactions: ProcessedRow[];

  /** Excluded rows (turnover, summary, etc.) */
  excluded: ProcessedRow[];

  /** Statistics */
  stats: {
    totalRows: number;
    validTransactions: number;
    excludedRows: number;
    categorizedByRule: number;
    categorizedByHeuristic: number;
    categorizedByAi: number;
    uncategorized: number;
  };

  /** Model info for auditing */
  modelInfo?: ModelInfo;
}

/**
 * Smart CSV Importer - combines all AI-powered import components
 */
export class SmartCsvImporter {
  private readonly headerNormalizer: CsvHeaderNormalizer;
  private readonly headerLearner: HeaderLearner;
  private readonly rowAnalyzer?: AiRowAnalyzer;
  private readonly streamCategorizer: StreamCategorizer;
  private readonly config: SmartImportConfig;

  constructor(
    llmClient: LlmClient | undefined,
    config: SmartImportConfig
  ) {
    this.config = config;

    // Initialize header normalizer (requires LLM)
    if (llmClient) {
      this.headerNormalizer = new CsvHeaderNormalizer(llmClient);
    } else {
      // Create a no-op normalizer that returns empty mappings
      this.headerNormalizer = {
        normalizeHeaders: async (headers: string[]) => ({
          mappings: headers.map((h) => ({ original: h, normalized: null, confidence: 0 })),
          detectedDelimiter: ',',
        }),
      } as CsvHeaderNormalizer;
    }

    // Initialize header learner
    const store = config.headerLearningStore || new InMemoryHeaderLearningStore();
    this.headerLearner = new HeaderLearner(store);

    // Initialize row analyzer (optional, requires LLM)
    if (llmClient && config.enableAiRowAnalysis !== false) {
      this.rowAnalyzer = new AiRowAnalyzer(llmClient);
    }

    // Initialize stream categorizer
    this.streamCategorizer = new StreamCategorizer(
      {
        categories: config.categories,
        rules: config.rules,
        enableAi: config.enableAiCategorization !== false,
        minAiConfidence: config.minAiConfidence ?? 50,
        locale: config.locale,
      },
      llmClient
    );
  }

  /**
   * Normalize headers with learning applied
   */
  async normalizeHeaders(
    headers: string[],
    sampleRows?: string[][]
  ): Promise<CsvNormalizationResult> {
    // Get AI-based normalization
    const aiResult = await this.headerNormalizer.normalizeHeaders(headers, sampleRows);

    // Apply learned corrections
    const learnedMappings = await this.headerLearner.applyLearnings(
      aiResult.mappings,
      this.config.workspaceId
    );

    return {
      ...aiResult,
      mappings: learnedMappings,
    };
  }

  /**
   * Learn from a user's header correction
   */
  async learnHeaderCorrection(
    originalHeader: string,
    correctedType: 'date' | 'description' | 'amount' | 'balance' | 'reference' | null,
    bankFormatId?: string
  ): Promise<void> {
    await this.headerLearner.learnCorrection(originalHeader, correctedType, {
      workspaceId: this.config.workspaceId,
      bankFormatId,
    });
  }

  /**
   * Analyze a row to determine if it's a valid transaction
   */
  async analyzeRow(
    row: Record<string, string>,
    context?: Partial<RowAnalysisContext>
  ): Promise<RowAnalysis> {
    if (!this.rowAnalyzer) {
      // Use heuristic analysis when AI is not available
      return this.heuristicRowAnalysis(row);
    }

    return this.rowAnalyzer.analyzeRow(row, {
      headers: context?.headers || Object.keys(row),
      previousRows: context?.previousRows,
      locale: context?.locale || this.config.locale,
      categories: context?.categories || this.config.categories.map((c) => c.name),
    });
  }

  /**
   * Heuristic row analysis (no AI)
   */
  private heuristicRowAnalysis(row: Record<string, string>): RowAnalysis {
    const values = Object.values(row).join(' ').toLowerCase();

    // Check for turnover/balance keywords
    const turnoverKeywords = [
      'turnover', 'käive', 'umsatz', 'оборот',
      'opening balance', 'closing balance', 'algsaldo', 'lõppsaldo',
      'anfangssaldo', 'endsaldo', 'beginning balance', 'ending balance',
      'total', 'subtotal', 'sum', 'kokku', 'summe', 'итого',
      'balance forward', 'carried forward', 'brought forward',
    ];

    const isTurnoverRow = turnoverKeywords.some((kw) => values.includes(kw));

    // Check for mostly empty row
    const nonEmptyValues = Object.values(row).filter((v) => v?.trim());
    const isMostlyEmpty = nonEmptyValues.length <= 1;

    // Check for separator row
    const isSeparator = /^[-=_\s]+$/.test(values);

    const isExcluded = isTurnoverRow || isMostlyEmpty || isSeparator;

    return {
      isTransaction: !isExcluded,
      confidence: isExcluded ? 80 : 70,
      reason: isTurnoverRow
        ? 'Detected as turnover/balance row'
        : isMostlyEmpty
          ? 'Row is mostly empty'
          : isSeparator
            ? 'Row appears to be a separator'
            : 'Appears to be a valid transaction',
      flags: {
        isTurnover: isTurnoverRow && values.includes('turnover'),
        isOpeningBalance: isTurnoverRow && /opening|beginning|alg/.test(values),
        isClosingBalance: isTurnoverRow && /closing|ending|lõpp/.test(values),
        isSummaryRow: isTurnoverRow && /total|sum|kokku/.test(values),
        isDuplicate: false,
        isRefund: /refund|tagasi/.test(values),
        isFee: /fee|charge|commission|tasu/.test(values),
        isTransfer: /transfer|ülekanne/.test(values),
      },
    };
  }

  /**
   * Categorize a transaction row
   */
  async categorizeRow(row: {
    description: string;
    amount: number;
    merchant?: string;
  }): Promise<RowCategorizationResult> {
    return this.streamCategorizer.categorizeRow(row);
  }

  /**
   * Process a full CSV import
   */
  async processImport(
    headers: string[],
    rows: string[][],
    columnMappings?: Record<string, string>
  ): Promise<SmartImportResult> {
    // Step 1: Normalize headers if mappings not provided
    let headerMappings: CsvNormalizationResult;
    if (!columnMappings) {
      headerMappings = await this.normalizeHeaders(headers, rows.slice(0, 5));
    } else {
      // Use provided mappings
      headerMappings = {
        mappings: headers.map((h) => ({
          original: h,
          normalized: (columnMappings[h] as 'date' | 'description' | 'amount' | null) || null,
          confidence: 1,
        })),
        detectedDelimiter: ',',
      };
    }

    // Step 2: Convert rows to objects using mappings
    const rowObjects = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] || '';
      });
      return obj;
    });

    // Step 3: Analyze and categorize each row
    const processedRows: ProcessedRow[] = [];
    const stats = {
      totalRows: rows.length,
      validTransactions: 0,
      excludedRows: 0,
      categorizedByRule: 0,
      categorizedByHeuristic: 0,
      categorizedByAi: 0,
      uncategorized: 0,
    };

    // Find column mappings
    const dateCol = headerMappings.mappings.find((m) => m.normalized === 'date')?.original;
    const descCol = headerMappings.mappings.find((m) => m.normalized === 'description')?.original;
    const amountCol = headerMappings.mappings.find((m) => m.normalized === 'amount')?.original;
    const balanceCol = headerMappings.mappings.find((m) => m.normalized === 'balance')?.original;
    const refCol = headerMappings.mappings.find((m) => m.normalized === 'reference')?.original;

    for (let i = 0; i < rowObjects.length; i++) {
      const row = rowObjects[i];
      const previousRows = rowObjects.slice(0, i);

      // Analyze row
      const analysis = await this.analyzeRow(row, {
        headers,
        previousRows,
      });

      const processed: ProcessedRow = {
        original: row,
        isTransaction: analysis.isTransaction,
        analysis,
      };

      if (analysis.isTransaction) {
        stats.validTransactions++;

        // Extract transaction data
        const description = descCol ? row[descCol] : Object.values(row).find((v) => v?.length > 10) || '';
        const amountStr = amountCol ? row[amountCol] : '';
        const amount = this.parseAmount(amountStr);

        if (description && amount !== null) {
          // Categorize
          const categorization = await this.categorizeRow({
            description,
            amount,
          });

          processed.categorization = categorization;

          // Track stats
          switch (categorization.method) {
            case 'rule':
              stats.categorizedByRule++;
              break;
            case 'heuristic':
              stats.categorizedByHeuristic++;
              break;
            case 'ai':
              stats.categorizedByAi++;
              break;
            default:
              stats.uncategorized++;
          }

          // Build transaction object
          processed.transaction = {
            date: dateCol ? row[dateCol] : '',
            description,
            amount,
            balance: balanceCol ? this.parseAmount(row[balanceCol]) ?? undefined : undefined,
            reference: refCol ? row[refCol] : undefined,
            categoryId: categorization.categoryId ?? undefined,
            categoryName: categorization.categoryName ?? undefined,
          };
        }
      } else {
        stats.excludedRows++;
      }

      processedRows.push(processed);
    }

    return {
      headerMappings,
      rows: processedRows,
      transactions: processedRows.filter((r) => r.isTransaction && r.transaction),
      excluded: processedRows.filter((r) => !r.isTransaction),
      stats,
    };
  }

  /**
   * Parse amount string to number
   */
  private parseAmount(value: string): number | null {
    if (!value?.trim()) return null;

    // Remove currency symbols and spaces
    let cleaned = value.replace(/[€$£¥₹\s]/g, '');

    // Handle parentheses as negative
    const isNegative = cleaned.includes('(') || cleaned.startsWith('-');
    cleaned = cleaned.replace(/[()]/g, '').replace(/^-/, '');

    // Detect decimal separator
    // If we have both comma and period, the last one is decimal
    const lastComma = cleaned.lastIndexOf(',');
    const lastPeriod = cleaned.lastIndexOf('.');

    if (lastComma > lastPeriod) {
      // European format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastPeriod > lastComma) {
      // American format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    } else if (lastComma > -1) {
      // Only comma: could be 1234,56 or 1,234
      const afterComma = cleaned.substring(lastComma + 1);
      if (afterComma.length === 2) {
        // Decimal: 1234,56
        cleaned = cleaned.replace(',', '.');
      } else {
        // Thousands: 1,234
        cleaned = cleaned.replace(',', '');
      }
    }

    const num = parseFloat(cleaned);
    if (isNaN(num)) return null;

    return isNegative ? -Math.abs(num) : num;
  }
}

/**
 * Factory function to create smart importer
 */
export function createSmartImporter(
  llmClient: LlmClient | undefined,
  config: SmartImportConfig
): SmartCsvImporter {
  return new SmartCsvImporter(llmClient, config);
}
