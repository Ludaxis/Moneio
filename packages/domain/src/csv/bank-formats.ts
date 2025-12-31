/**
 * Bank Format Types
 *
 * Configurable bank format definitions for CSV import.
 * No hardcoding - all patterns loaded from config or database.
 */

import { z } from 'zod';

/**
 * Normalized field types for column mapping
 */
export type NormalizedField =
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'balance'
  | 'reference'
  | 'counterpartyName'
  | 'counterpartyAccount'
  | 'currency'
  | 'status'
  | 'category'
  | 'fee';

/**
 * Header pattern for column detection
 */
export interface HeaderPattern {
  field: NormalizedField;
  patterns: string[]; // Regex patterns (case-insensitive)
  priority: number; // Higher = checked first
}

/**
 * Amount column configuration
 */
export interface AmountConfig {
  /**
   * 'single' - One column with signed amounts
   * 'split' - Separate debit and credit columns
   */
  type: 'single' | 'split';

  /**
   * Header pattern for debit column (when type = 'split')
   */
  debitPatterns?: string[];

  /**
   * Header pattern for credit column (when type = 'split')
   */
  creditPatterns?: string[];

  /**
   * How to interpret signs:
   * - 'negative-debit': Debits are negative, credits positive (most common)
   * - 'positive-debit': Debits are positive, credits negative
   * - 'absolute': Both columns contain positive values
   */
  signConvention: 'negative-debit' | 'positive-debit' | 'absolute';
}

/**
 * Date format configuration
 */
export interface DateConfig {
  /**
   * Primary date format pattern
   * Examples: 'DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'
   */
  format: string;

  /**
   * Alternative formats to try if primary fails
   */
  fallbackFormats?: string[];

  /**
   * Locale hint for ambiguous dates (e.g., 01/02/2024)
   */
  locale?: 'eu' | 'us' | 'iso';
}

/**
 * Row exclusion patterns for filtering turnover/summary rows
 */
export interface ExclusionConfig {
  /**
   * Patterns to match against description (regex, case-insensitive)
   */
  descriptionPatterns: string[];

  /**
   * Keywords that indicate turnover/summary rows
   */
  turnoverKeywords: string[];

  /**
   * Exclude rows with zero amount
   */
  excludeZeroAmount: boolean;

  /**
   * Exclude rows missing required amount
   */
  excludeMissingAmount: boolean;
}

/**
 * Complete bank format definition
 */
export interface BankFormat {
  /**
   * Unique identifier for this format
   */
  id: string;

  /**
   * Display name
   */
  name: string;

  /**
   * Bank/institution name (optional)
   */
  bank?: string;

  /**
   * Country code (ISO 3166-1 alpha-2)
   */
  country?: string;

  /**
   * Header patterns for column detection
   */
  headerPatterns: HeaderPattern[];

  /**
   * Amount parsing configuration
   */
  amountConfig: AmountConfig;

  /**
   * Date parsing configuration
   */
  dateConfig: DateConfig;

  /**
   * Row exclusion configuration
   */
  exclusionConfig: ExclusionConfig;

  /**
   * Expected file encoding (default: UTF-8)
   */
  encoding?: string;

  /**
   * Expected delimiter (auto-detect if not specified)
   */
  delimiter?: string;

  /**
   * Whether this is a built-in format (vs user-defined)
   */
  isBuiltIn: boolean;

  /**
   * Workspace ID for user-defined formats (null for built-in)
   */
  workspaceId?: string | null;

  /**
   * Priority for format detection (higher = checked first)
   */
  priority: number;
}

/**
 * Zod schema for BankFormat validation
 */
export const BankFormatSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bank: z.string().optional(),
  country: z.string().length(2).optional(),
  headerPatterns: z.array(
    z.object({
      field: z.enum([
        'date',
        'description',
        'amount',
        'debit',
        'credit',
        'balance',
        'reference',
        'counterpartyName',
        'counterpartyAccount',
        'currency',
        'status',
        'category',
        'fee',
      ]),
      patterns: z.array(z.string()),
      priority: z.number().int().default(0),
    })
  ),
  amountConfig: z.object({
    type: z.enum(['single', 'split']),
    debitPatterns: z.array(z.string()).optional(),
    creditPatterns: z.array(z.string()).optional(),
    signConvention: z.enum(['negative-debit', 'positive-debit', 'absolute']),
  }),
  dateConfig: z.object({
    format: z.string(),
    fallbackFormats: z.array(z.string()).optional(),
    locale: z.enum(['eu', 'us', 'iso']).optional(),
  }),
  exclusionConfig: z.object({
    descriptionPatterns: z.array(z.string()),
    turnoverKeywords: z.array(z.string()),
    excludeZeroAmount: z.boolean(),
    excludeMissingAmount: z.boolean(),
  }),
  encoding: z.string().optional(),
  delimiter: z.string().optional(),
  isBuiltIn: z.boolean(),
  workspaceId: z.string().nullable().optional(),
  priority: z.number().int().default(0),
});

/**
 * Format detection result
 */
export interface FormatDetectionResult {
  /**
   * Detected format (null if no match)
   */
  format: BankFormat | null;

  /**
   * Confidence score (0-100)
   */
  confidence: number;

  /**
   * Matched header patterns
   */
  matchedPatterns: Array<{
    field: NormalizedField;
    header: string;
    pattern: string;
  }>;

  /**
   * Headers that couldn't be mapped
   */
  unmappedHeaders: string[];
}

/**
 * Column mapping result from format detection
 */
export interface ColumnMappingResult {
  /**
   * Detected column mappings
   */
  mappings: Map<NormalizedField, string>;

  /**
   * Whether split debit/credit columns were detected
   */
  hasSplitAmount: boolean;

  /**
   * Debit column header (if split)
   */
  debitColumn?: string;

  /**
   * Credit column header (if split)
   */
  creditColumn?: string;

  /**
   * Amount column header (if single)
   */
  amountColumn?: string;

  /**
   * Confidence score (0-100)
   */
  confidence: number;
}
