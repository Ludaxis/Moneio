/**
 * Bank Format Registry
 *
 * Manages bank format definitions and provides format detection.
 * Loads formats from JSON config and allows workspace-specific overrides.
 */

import type {
  BankFormat,
  FormatDetectionResult,
  ColumnMappingResult,
  NormalizedField,
  HeaderPattern,
} from './bank-formats';
import { BankFormatSchema } from './bank-formats';

/**
 * Built-in bank formats loaded from config
 */
let builtInFormats: BankFormat[] = [];

/**
 * Initialize registry with built-in formats
 */
export function initializeRegistry(formats: unknown[]): void {
  builtInFormats = [];

  for (const format of formats) {
    try {
      const validated = BankFormatSchema.parse(format);
      builtInFormats.push(validated);
    } catch (_error) {
      // Skip invalid formats silently - validation errors are expected for malformed config
    }
  }

  // Sort by priority (higher first)
  builtInFormats.sort((a, b) => b.priority - a.priority);
}

/**
 * Get all built-in formats
 */
export function getBuiltInFormats(): readonly BankFormat[] {
  return builtInFormats;
}

/**
 * Get a specific format by ID
 */
export function getFormatById(id: string): BankFormat | undefined {
  return builtInFormats.find((f) => f.id === id);
}

/**
 * Get formats for a specific country
 */
export function getFormatsByCountry(countryCode: string): BankFormat[] {
  return builtInFormats.filter((f) => f.country === countryCode.toUpperCase());
}

/**
 * Detect the best matching bank format for given headers
 */
export function detectBankFormat(
  headers: string[],
  workspaceFormats: BankFormat[] = []
): FormatDetectionResult {
  // Combine workspace formats (higher priority) with built-in formats
  const allFormats = [...workspaceFormats, ...builtInFormats].sort(
    (a, b) => b.priority - a.priority
  );

  let bestMatch: FormatDetectionResult = {
    format: null,
    confidence: 0,
    matchedPatterns: [],
    unmappedHeaders: [...headers],
  };

  for (const format of allFormats) {
    const result = evaluateFormat(format, headers);

    if (result.confidence > bestMatch.confidence) {
      bestMatch = result;
    }

    // If we have a high-confidence match, stop searching
    if (result.confidence >= 90) {
      break;
    }
  }

  return bestMatch;
}

/**
 * Evaluate how well a format matches the given headers
 */
function evaluateFormat(format: BankFormat, headers: string[]): FormatDetectionResult {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  const matchedPatterns: FormatDetectionResult['matchedPatterns'] = [];
  const matchedHeaderIndices = new Set<number>();

  // Required fields for a valid match
  const requiredFields: NormalizedField[] = ['date', 'description'];
  const amountFields: NormalizedField[] =
    format.amountConfig.type === 'single' ? ['amount'] : ['debit', 'credit'];

  const foundFields = new Set<NormalizedField>();

  // Check each header pattern
  for (const headerPattern of format.headerPatterns) {
    const matchResult = findMatchingHeader(headerPattern, headers, normalizedHeaders);

    if (matchResult) {
      matchedPatterns.push({
        field: headerPattern.field,
        header: matchResult.header,
        pattern: matchResult.pattern,
      });
      matchedHeaderIndices.add(matchResult.index);
      foundFields.add(headerPattern.field);
    }
  }

  // Check if required fields are found
  const hasRequiredFields = requiredFields.every((f) => foundFields.has(f));

  // Check if amount field(s) are found
  const hasAmountFields = amountFields.some((f) => foundFields.has(f));

  // Calculate confidence
  let confidence = 0;

  if (hasRequiredFields && hasAmountFields) {
    // Base confidence from matched patterns
    const totalPatterns = format.headerPatterns.length;
    const matchRatio = matchedPatterns.length / totalPatterns;

    confidence = Math.round(matchRatio * 80); // Up to 80% from pattern matching

    // Bonus for matching bank/format-specific patterns
    if (matchedPatterns.length >= 5) {
      confidence += 10;
    }

    // Bonus if most headers are recognized
    const headerCoverage = matchedPatterns.length / headers.length;
    if (headerCoverage >= 0.7) {
      confidence += 10;
    }

    confidence = Math.min(100, confidence);
  }

  // Determine unmapped headers
  const unmappedHeaders = headers.filter((_, i) => !matchedHeaderIndices.has(i));

  return {
    format: confidence > 0 ? format : null,
    confidence,
    matchedPatterns,
    unmappedHeaders,
  };
}

/**
 * Find a header that matches a pattern
 */
function findMatchingHeader(
  pattern: HeaderPattern,
  headers: string[],
  normalizedHeaders: string[]
): { header: string; pattern: string; index: number } | null {
  for (const patternStr of pattern.patterns) {
    try {
      const regex = new RegExp(patternStr, 'i');

      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (regex.test(normalizedHeaders[i]) || regex.test(headers[i])) {
          return {
            header: headers[i],
            pattern: patternStr,
            index: i,
          };
        }
      }
    } catch {
      // Invalid regex, try exact match
      const idx = normalizedHeaders.findIndex(
        (h) => h === patternStr.toLowerCase() || h.includes(patternStr.toLowerCase())
      );

      if (idx >= 0) {
        return {
          header: headers[idx],
          pattern: patternStr,
          index: idx,
        };
      }
    }
  }

  return null;
}

/**
 * Get column mappings from a format for given headers
 */
export function getColumnMappings(format: BankFormat, headers: string[]): ColumnMappingResult {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  const mappings = new Map<NormalizedField, string>();
  let confidence = 0;

  for (const headerPattern of format.headerPatterns) {
    const match = findMatchingHeader(headerPattern, headers, normalizedHeaders);

    if (match) {
      mappings.set(headerPattern.field, match.header);
    }
  }

  // Calculate confidence
  const requiredFields = ['date', 'description', 'amount'];
  const foundRequired = requiredFields.filter((f) => mappings.has(f as NormalizedField));
  confidence = Math.round((foundRequired.length / requiredFields.length) * 100);

  // Determine amount configuration
  const hasSplitAmount = mappings.has('debit') || mappings.has('credit');

  return {
    mappings,
    hasSplitAmount,
    debitColumn: mappings.get('debit'),
    creditColumn: mappings.get('credit'),
    amountColumn: mappings.get('amount'),
    confidence,
  };
}

/**
 * Create a custom format from detected patterns
 */
export function createCustomFormat(
  id: string,
  name: string,
  _headers: string[],
  detectedMappings: Map<NormalizedField, string>
): BankFormat {
  const headerPatterns: HeaderPattern[] = [];

  for (const [field, header] of detectedMappings) {
    headerPatterns.push({
      field,
      patterns: [escapeRegex(header)],
      priority: 0,
    });
  }

  // Determine amount type
  const hasDebit = detectedMappings.has('debit');
  const hasCredit = detectedMappings.has('credit');
  const hasSplitAmount = hasDebit || hasCredit;

  return {
    id,
    name,
    headerPatterns,
    amountConfig: {
      type: hasSplitAmount ? 'split' : 'single',
      signConvention: hasSplitAmount ? 'absolute' : 'negative-debit',
      debitPatterns: hasDebit ? [escapeRegex(detectedMappings.get('debit')!)] : undefined,
      creditPatterns: hasCredit ? [escapeRegex(detectedMappings.get('credit')!)] : undefined,
    },
    dateConfig: {
      format: 'auto',
      locale: 'eu',
    },
    exclusionConfig: {
      descriptionPatterns: [],
      turnoverKeywords: [],
      excludeZeroAmount: true,
      excludeMissingAmount: true,
    },
    isBuiltIn: false,
    priority: 100, // User formats have high priority
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Merge a custom format with default settings
 */
export function mergeWithDefaults(partial: Partial<BankFormat>): BankFormat {
  const defaults: BankFormat = {
    id: 'custom',
    name: 'Custom Format',
    headerPatterns: [],
    amountConfig: {
      type: 'single',
      signConvention: 'negative-debit',
    },
    dateConfig: {
      format: 'auto',
      locale: 'eu',
    },
    exclusionConfig: {
      descriptionPatterns: [],
      turnoverKeywords: [],
      excludeZeroAmount: true,
      excludeMissingAmount: true,
    },
    isBuiltIn: false,
    priority: 0,
  };

  return {
    ...defaults,
    ...partial,
    amountConfig: {
      ...defaults.amountConfig,
      ...partial.amountConfig,
    },
    dateConfig: {
      ...defaults.dateConfig,
      ...partial.dateConfig,
    },
    exclusionConfig: {
      ...defaults.exclusionConfig,
      ...partial.exclusionConfig,
    },
  };
}
