/**
 * Row Filter
 *
 * Smart filtering for CSV rows to exclude turnover, summary,
 * and other non-transaction rows.
 */

import type { ExclusionConfig } from './bank-formats';

/**
 * Result of row filtering
 */
export interface RowFilterResult {
  /**
   * Whether the row should be excluded
   */
  excluded: boolean;

  /**
   * Reason for exclusion (if excluded)
   */
  reason?: string;

  /**
   * Exclusion category for analytics
   */
  category?: 'turnover' | 'summary' | 'zero_amount' | 'missing_amount' | 'pattern_match' | 'status';
}

/**
 * Default turnover keywords (multilingual)
 */
export const DEFAULT_TURNOVER_KEYWORDS: string[] = [
  // English
  'opening balance',
  'closing balance',
  'beginning balance',
  'ending balance',
  'balance forward',
  'carried forward',
  'brought forward',
  'total',
  'subtotal',
  'grand total',
  'sum',
  'turnover',
  'period start',
  'period end',
  'statement total',
  'account summary',
  'balance summary',

  // German
  'anfangssaldo',
  'endsaldo',
  'saldo vortrag',
  'übertrag',
  'summe',
  'umsatz',
  'kontostand',

  // Estonian
  'algsaldo',
  'lõppsaldo',
  'saldo',
  'kokku',
  'käive',

  // Russian
  'начальный баланс',
  'конечный баланс',
  'итого',
  'оборот',
  'сальдо',

  // Spanish
  'saldo inicial',
  'saldo final',
  'total',
  'subtotal',

  // French
  'solde initial',
  'solde final',
  'total',
  'sous-total',
  'report',

  // Dutch
  'beginsaldo',
  'eindsaldo',
  'totaal',
  'omzet',
];

/**
 * Default description patterns to exclude (regex)
 */
export const DEFAULT_EXCLUSION_PATTERNS: string[] = [
  // Balance rows
  '^\\s*balance\\s*$',
  '^\\s*saldo\\s*$',
  '^\\s*total\\s*$',
  '^\\s*---+\\s*$', // Separator lines

  // Statement metadata
  '^\\s*statement\\s+period',
  '^\\s*account\\s+number',
  '^\\s*page\\s+\\d+',

  // Empty or whitespace
  '^\\s*$',
  '^\\s*-+\\s*$',
  '^\\s*=+\\s*$',
];

/**
 * Status values that indicate non-transaction rows
 */
export const EXCLUDED_STATUSES: string[] = [
  'refunded',
  'cancelled',
  'canceled',
  'failed',
  'reversed',
  'void',
  'rejected',
  'declined',
];

/**
 * Create a row filter from configuration
 */
export function createRowFilter(config: Partial<ExclusionConfig> = {}): RowFilter {
  const mergedConfig: ExclusionConfig = {
    descriptionPatterns: config.descriptionPatterns ?? DEFAULT_EXCLUSION_PATTERNS,
    turnoverKeywords: config.turnoverKeywords ?? DEFAULT_TURNOVER_KEYWORDS,
    excludeZeroAmount: config.excludeZeroAmount ?? true,
    excludeMissingAmount: config.excludeMissingAmount ?? true,
  };

  return new RowFilter(mergedConfig);
}

/**
 * Row filter class for evaluating CSV rows
 */
export class RowFilter {
  private readonly descriptionPatterns: RegExp[];
  private readonly turnoverKeywords: string[];
  private readonly excludeZeroAmount: boolean;
  private readonly excludeMissingAmount: boolean;

  constructor(config: ExclusionConfig) {
    // Compile regex patterns (case-insensitive)
    this.descriptionPatterns = config.descriptionPatterns.map(
      (pattern) => new RegExp(pattern, 'i')
    );

    // Normalize keywords to lowercase for comparison
    this.turnoverKeywords = config.turnoverKeywords.map((kw) => kw.toLowerCase().trim());

    this.excludeZeroAmount = config.excludeZeroAmount;
    this.excludeMissingAmount = config.excludeMissingAmount;
  }

  /**
   * Check if a row should be excluded
   */
  isExcluded(row: {
    description?: string;
    amount?: number | string | null;
    status?: string;
    rawRow?: Record<string, string>;
  }): RowFilterResult {
    // Check status field first
    if (row.status) {
      const normalizedStatus = row.status.toLowerCase().trim();
      if (EXCLUDED_STATUSES.includes(normalizedStatus)) {
        return {
          excluded: true,
          reason: `Status indicates non-transaction: ${row.status}`,
          category: 'status',
        };
      }
    }

    // Check amount
    const amount = this.parseAmount(row.amount);

    if (this.excludeMissingAmount && amount === null) {
      return {
        excluded: true,
        reason: 'Missing amount value',
        category: 'missing_amount',
      };
    }

    if (this.excludeZeroAmount && amount === 0) {
      return {
        excluded: true,
        reason: 'Zero amount transaction',
        category: 'zero_amount',
      };
    }

    // Check description
    const description = row.description?.trim() ?? '';
    const normalizedDesc = description.toLowerCase();

    // Check turnover keywords
    for (const keyword of this.turnoverKeywords) {
      if (normalizedDesc.includes(keyword)) {
        return {
          excluded: true,
          reason: `Description contains turnover keyword: "${keyword}"`,
          category: 'turnover',
        };
      }
    }

    // Check exclusion patterns
    for (const pattern of this.descriptionPatterns) {
      if (pattern.test(description)) {
        return {
          excluded: true,
          reason: `Description matches exclusion pattern: ${pattern.source}`,
          category: 'pattern_match',
        };
      }
    }

    // Check for summary row indicators in raw data
    if (row.rawRow) {
      const summaryResult = this.checkForSummaryRow(row.rawRow);
      if (summaryResult.excluded) {
        return summaryResult;
      }
    }

    return { excluded: false };
  }

  /**
   * Parse amount from various formats
   */
  private parseAmount(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    const cleaned = value.replace(/[^\d.,\-()]/g, '');
    if (!cleaned || cleaned === '-') {
      return null;
    }

    // Handle parentheses as negative
    const isNegative = cleaned.includes('(') && cleaned.includes(')');
    let numStr = cleaned.replace(/[()]/g, '');

    // Handle European format (comma as decimal)
    const lastComma = numStr.lastIndexOf(',');
    const lastDot = numStr.lastIndexOf('.');

    if (lastComma > lastDot) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else if (lastComma !== -1 && lastDot === -1) {
      numStr = numStr.replace(',', '.');
    }

    const result = parseFloat(numStr);
    if (isNaN(result)) {
      return null;
    }

    return isNegative ? -Math.abs(result) : result;
  }

  /**
   * Check if a row looks like a summary/total row
   */
  private checkForSummaryRow(rawRow: Record<string, string>): RowFilterResult {
    const values = Object.values(rawRow);

    // Count empty cells - summary rows often have mostly empty cells
    const emptyCount = values.filter((v) => !v?.trim()).length;
    const totalCells = values.length;

    // If more than 70% of cells are empty and there's an amount, likely a summary
    if (totalCells > 3 && emptyCount / totalCells > 0.7) {
      // Check if any cell contains summary keywords
      for (const value of values) {
        if (!value) continue;
        const normalized = value.toLowerCase().trim();
        for (const keyword of this.turnoverKeywords) {
          if (normalized.includes(keyword)) {
            return {
              excluded: true,
              reason: `Row appears to be a summary (mostly empty with keyword: "${keyword}")`,
              category: 'summary',
            };
          }
        }
      }
    }

    return { excluded: false };
  }

  /**
   * Filter an array of rows, returning only valid transactions
   */
  filterRows<T extends { description?: string; amount?: number | string | null; status?: string }>(
    rows: T[]
  ): { included: T[]; excluded: Array<{ row: T; result: RowFilterResult }> } {
    const included: T[] = [];
    const excluded: Array<{ row: T; result: RowFilterResult }> = [];

    for (const row of rows) {
      const result = this.isExcluded(row);
      if (result.excluded) {
        excluded.push({ row, result });
      } else {
        included.push(row);
      }
    }

    return { included, excluded };
  }
}

/**
 * Quick check if a description likely indicates a turnover row
 */
export function isTurnoverDescription(description: string): boolean {
  const normalized = description.toLowerCase().trim();
  return DEFAULT_TURNOVER_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Get default exclusion config
 */
export function getDefaultExclusionConfig(): ExclusionConfig {
  return {
    descriptionPatterns: DEFAULT_EXCLUSION_PATTERNS,
    turnoverKeywords: DEFAULT_TURNOVER_KEYWORDS,
    excludeZeroAmount: true,
    excludeMissingAmount: true,
  };
}
