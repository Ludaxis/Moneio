/**
 * Amount Parser
 *
 * Handles parsing of transaction amounts from CSV, including:
 * - Single amount column with signed values
 * - Split debit/credit columns
 * - Various number formats (European, American, etc.)
 */

import type { AmountConfig } from './bank-formats';

/**
 * Configuration for amount parsing
 */
export interface AmountParserConfig {
  /**
   * Column type: single amount or split debit/credit
   */
  type: 'single' | 'split';

  /**
   * Column name for single amount
   */
  amountColumn?: string;

  /**
   * Column name for debit amounts (when split)
   */
  debitColumn?: string;

  /**
   * Column name for credit amounts (when split)
   */
  creditColumn?: string;

  /**
   * How to interpret signs
   */
  signConvention: 'negative-debit' | 'positive-debit' | 'absolute';

  /**
   * Decimal separator (auto-detect if not specified)
   */
  decimalSeparator?: '.' | ',' | 'auto';

  /**
   * Thousands separator (auto-detect if not specified)
   */
  thousandsSeparator?: ',' | '.' | ' ' | "'" | 'auto';
}

/**
 * Result of amount parsing
 */
export interface AmountParseResult {
  /**
   * Parsed amount (positive = credit/income, negative = debit/expense)
   */
  amount: number | null;

  /**
   * Whether the amount was from debit or credit column (for split)
   */
  source?: 'debit' | 'credit' | 'single';

  /**
   * Original value(s) before parsing
   */
  rawValues: {
    amount?: string;
    debit?: string;
    credit?: string;
  };

  /**
   * Any parsing warnings
   */
  warnings: string[];
}

/**
 * Create an amount parser from configuration
 */
export function createAmountParser(config: AmountParserConfig): AmountParser {
  return new AmountParser(config);
}

/**
 * Amount parser class
 */
export class AmountParser {
  private readonly config: AmountParserConfig;

  constructor(config: AmountParserConfig) {
    this.config = config;
  }

  /**
   * Parse amount from a CSV row
   */
  parse(row: Record<string, string>): AmountParseResult {
    const warnings: string[] = [];
    const rawValues: AmountParseResult['rawValues'] = {};

    if (this.config.type === 'single') {
      return this.parseSingleColumn(row, rawValues, warnings);
    } else {
      return this.parseSplitColumns(row, rawValues, warnings);
    }
  }

  /**
   * Parse from single amount column
   */
  private parseSingleColumn(
    row: Record<string, string>,
    rawValues: AmountParseResult['rawValues'],
    warnings: string[]
  ): AmountParseResult {
    const columnName = this.config.amountColumn;

    if (!columnName) {
      return {
        amount: null,
        source: 'single',
        rawValues,
        warnings: ['No amount column configured'],
      };
    }

    const rawValue = row[columnName];
    rawValues.amount = rawValue;

    if (!rawValue?.trim()) {
      return {
        amount: null,
        source: 'single',
        rawValues,
        warnings: ['Empty amount value'],
      };
    }

    const amount = this.parseNumber(rawValue);

    if (amount === null) {
      warnings.push(`Could not parse amount: "${rawValue}"`);
    }

    return {
      amount,
      source: 'single',
      rawValues,
      warnings,
    };
  }

  /**
   * Parse from split debit/credit columns
   */
  private parseSplitColumns(
    row: Record<string, string>,
    rawValues: AmountParseResult['rawValues'],
    warnings: string[]
  ): AmountParseResult {
    const debitCol = this.config.debitColumn;
    const creditCol = this.config.creditColumn;

    if (!debitCol && !creditCol) {
      return {
        amount: null,
        rawValues,
        warnings: ['No debit or credit columns configured'],
      };
    }

    const debitRaw = debitCol ? row[debitCol] : undefined;
    const creditRaw = creditCol ? row[creditCol] : undefined;

    rawValues.debit = debitRaw;
    rawValues.credit = creditRaw;

    const debitValue = debitRaw?.trim() ? this.parseNumber(debitRaw) : null;
    const creditValue = creditRaw?.trim() ? this.parseNumber(creditRaw) : null;

    // Determine which value to use
    let amount: number | null = null;
    let source: 'debit' | 'credit' | undefined;

    const hasDebit = debitValue !== null && debitValue !== 0;
    const hasCredit = creditValue !== null && creditValue !== 0;

    if (hasDebit && hasCredit) {
      // Both columns have values - unusual, but handle it
      warnings.push('Both debit and credit columns have values');

      // Use the larger absolute value, with appropriate sign
      if (Math.abs(debitValue!) >= Math.abs(creditValue!)) {
        amount = this.applySignConvention(debitValue!, 'debit');
        source = 'debit';
      } else {
        amount = this.applySignConvention(creditValue!, 'credit');
        source = 'credit';
      }
    } else if (hasDebit) {
      amount = this.applySignConvention(debitValue!, 'debit');
      source = 'debit';
    } else if (hasCredit) {
      amount = this.applySignConvention(creditValue!, 'credit');
      source = 'credit';
    } else {
      // Neither column has a value
      if (debitRaw?.trim() || creditRaw?.trim()) {
        warnings.push('Could not parse debit/credit values');
      }
    }

    return {
      amount,
      source,
      rawValues,
      warnings,
    };
  }

  /**
   * Apply sign convention based on whether value is from debit or credit
   */
  private applySignConvention(value: number, source: 'debit' | 'credit'): number {
    const absValue = Math.abs(value);

    switch (this.config.signConvention) {
      case 'negative-debit':
        // Debits are expenses (negative), credits are income (positive)
        return source === 'debit' ? -absValue : absValue;

      case 'positive-debit':
        // Debits are income (positive), credits are expenses (negative)
        return source === 'debit' ? absValue : -absValue;

      case 'absolute':
        // Both columns contain positive values, we determine sign by column
        // Debit = expense = negative, Credit = income = positive
        return source === 'debit' ? -absValue : absValue;

      default:
        return value;
    }
  }

  /**
   * Parse a number string handling various formats
   */
  private parseNumber(value: string): number | null {
    if (!value) return null;

    // Remove currency symbols, letters, and extra whitespace
    let cleaned = value
      .replace(/[^\d.,\-+()'\s]/g, '')
      .replace(/\s+/g, '')
      .trim();

    if (!cleaned || cleaned === '-' || cleaned === '+') {
      return null;
    }

    // Handle parentheses as negative (accounting format)
    const isNegativeParens = cleaned.startsWith('(') && cleaned.endsWith(')');
    if (isNegativeParens) {
      cleaned = cleaned.slice(1, -1);
    }

    // Handle leading minus or plus
    const isNegativeSign = cleaned.startsWith('-');
    const isPositiveSign = cleaned.startsWith('+');
    if (isNegativeSign || isPositiveSign) {
      cleaned = cleaned.slice(1);
    }

    // Detect decimal separator
    const decimalSep = this.detectDecimalSeparator(cleaned);

    // Normalize to standard format
    if (decimalSep === ',') {
      // European format: remove dots (thousands), replace comma with dot
      cleaned = cleaned.replace(/\./g, '').replace(/'/g, '').replace(',', '.');
    } else if (decimalSep === '.') {
      // American format: remove commas and apostrophes (thousands)
      cleaned = cleaned.replace(/,/g, '').replace(/'/g, '');
    } else {
      // No decimal, just remove all separators
      cleaned = cleaned.replace(/[.,'\s]/g, '');
    }

    const result = parseFloat(cleaned);

    if (isNaN(result)) {
      return null;
    }

    // Apply negative sign
    if (isNegativeParens || isNegativeSign) {
      return -Math.abs(result);
    }

    return result;
  }

  /**
   * Detect which character is the decimal separator
   */
  private detectDecimalSeparator(value: string): '.' | ',' | null {
    // If configured, use that
    if (this.config.decimalSeparator && this.config.decimalSeparator !== 'auto') {
      return this.config.decimalSeparator;
    }

    const lastDot = value.lastIndexOf('.');
    const lastComma = value.lastIndexOf(',');

    // No separators
    if (lastDot === -1 && lastComma === -1) {
      return null;
    }

    // Only one type of separator
    if (lastDot === -1) {
      // Only commas - check if it's decimal or thousands
      const commaCount = (value.match(/,/g) || []).length;
      const afterComma = value.slice(lastComma + 1);

      // If only one comma and 1-2 digits after, it's decimal
      if (commaCount === 1 && afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
        return ',';
      }
      // Multiple commas = thousands separator
      return null;
    }

    if (lastComma === -1) {
      // Only dots - check if it's decimal or thousands
      const dotCount = (value.match(/\./g) || []).length;
      const afterDot = value.slice(lastDot + 1);

      // If only one dot and 1-2 digits after, it's decimal
      if (dotCount === 1 && afterDot.length <= 2 && /^\d+$/.test(afterDot)) {
        return '.';
      }
      // Multiple dots = thousands separator
      return null;
    }

    // Both present - the one that appears last is the decimal
    return lastComma > lastDot ? ',' : '.';
  }
}

/**
 * Auto-detect amount configuration from headers
 */
export function detectAmountConfig(headers: string[]): Partial<AmountParserConfig> {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  // Check for split debit/credit columns
  const debitPatterns = [
    'debit',
    'withdrawal',
    'ausgabe',
    'deebet',
    'soll',
    'debet',
    'out',
    'expense',
  ];
  const creditPatterns = [
    'credit',
    'deposit',
    'einnahme',
    'kreedit',
    'haben',
    'kredit',
    'in',
    'income',
  ];

  const debitIdx = normalized.findIndex((h) => debitPatterns.some((p) => h.includes(p)));
  const creditIdx = normalized.findIndex((h) => creditPatterns.some((p) => h.includes(p)));

  if (debitIdx >= 0 || creditIdx >= 0) {
    return {
      type: 'split',
      debitColumn: debitIdx >= 0 ? headers[debitIdx] : undefined,
      creditColumn: creditIdx >= 0 ? headers[creditIdx] : undefined,
      signConvention: 'absolute', // Split columns typically have absolute values
    };
  }

  // Check for single amount column
  const amountPatterns = ['amount', 'sum', 'summa', 'betrag', 'montant', 'مبلغ', 'value'];
  const amountIdx = normalized.findIndex((h) => amountPatterns.some((p) => h.includes(p)));

  if (amountIdx >= 0) {
    return {
      type: 'single',
      amountColumn: headers[amountIdx],
      signConvention: 'negative-debit',
    };
  }

  return {};
}

/**
 * Create amount parser config from bank format
 */
export function createAmountParserConfigFromBankFormat(
  bankFormat: { amountConfig: AmountConfig },
  columnMapping: Map<string, string>
): AmountParserConfig {
  const config: AmountParserConfig = {
    type: bankFormat.amountConfig.type,
    signConvention: bankFormat.amountConfig.signConvention,
  };

  if (config.type === 'single') {
    config.amountColumn = columnMapping.get('amount');
  } else {
    config.debitColumn = columnMapping.get('debit');
    config.creditColumn = columnMapping.get('credit');
  }

  return config;
}
