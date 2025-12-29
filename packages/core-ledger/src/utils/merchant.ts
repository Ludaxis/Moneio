/**
 * Merchant Name Normalization Utilities
 *
 * Used for grouping transactions by merchant to detect recurring patterns,
 * match invoices to payments, and aggregate spending by vendor.
 */

/**
 * Common business suffixes to remove during normalization
 */
const BUSINESS_SUFFIXES = [
  // English
  'llc',
  'inc',
  'corp',
  'corporation',
  'ltd',
  'limited',
  'co',
  'company',
  'plc',
  'llp',
  'lp',
  // European
  'gmbh',
  'ag',
  'bv',
  'nv',
  'sa',
  'sarl',
  'srl',
  'spa',
  'ab',
  'as',
  'oy',
  'oü',
];

/**
 * Patterns that indicate transaction metadata (not merchant name)
 */
const TRANSACTION_PREFIXES = [
  /^(debit|credit)\s*(card)?\s*(purchase|payment)?\s*(at|from|to)?\s*/i,
  /^(purchase|payment|transfer)\s*(at|from|to)?\s*/i,
  /^(pos|atm|ach|wire)\s*(debit|credit|withdrawal|deposit)?\s*/i,
  /^(recurring|automatic|scheduled)\s*(payment|charge|debit)?\s*/i,
  /^(online|internet|mobile)\s*(purchase|payment|transfer)?\s*/i,
  /^(check|cheque)\s*#?\d*\s*/i,
  /^(ref|reference|txn|transaction)\s*#?:?\s*\d+\s*/i,
];

/**
 * Patterns to remove from the end (transaction IDs, dates, locations)
 */
const TRAILING_PATTERNS = [
  /\s+#\d+$/i, // Reference numbers
  /\s+\d{2,}\/\d{2,}(\/\d{2,4})?$/i, // Dates like 12/25 or 12/25/24
  /\s+\d{4}-\d{2}-\d{2}$/i, // ISO dates
  /\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/i, // US state + zip
  /\s+[A-Z]{2,3}\s*$/i, // Country/state codes at end
  /\s+\d{6,}$/i, // Long numbers (likely IDs)
  /\s+x{2,}\d{4}$/i, // Card numbers like xxxx1234
  /\s+\*{2,}\d{4}$/i, // Card numbers like ****1234
];

/**
 * Common words to remove that don't help with merchant identification
 */
const NOISE_WORDS = [
  'the',
  'and',
  'of',
  'for',
  'to',
  'in',
  'at',
  'by',
  'via',
  'payment',
  'purchase',
  'subscription',
  'membership',
  'service',
  'services',
  'billing',
];

/**
 * Extract merchant name from raw transaction description
 *
 * Handles common bank transaction formats:
 * - "PURCHASE AT AMAZON" -> "AMAZON"
 * - "DEBIT CARD PURCHASE - NETFLIX" -> "NETFLIX"
 * - "ACH DEBIT SPOTIFY USA" -> "SPOTIFY"
 * - "POS STARBUCKS #12345 SEATTLE WA" -> "STARBUCKS"
 */
export function extractMerchantFromDescription(description: string): string {
  if (!description) return '';

  let result = description.trim();

  // Remove common transaction prefixes
  for (const pattern of TRANSACTION_PREFIXES) {
    result = result.replace(pattern, '');
  }

  // Remove trailing patterns (IDs, dates, locations)
  for (const pattern of TRAILING_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // Remove content in parentheses (often contains metadata)
  result = result.replace(/\([^)]*\)/g, '');

  // Clean up separators - take first meaningful segment
  // "MERCHANT NAME - SOME EXTRA INFO" -> "MERCHANT NAME"
  const separators = [' - ', ' / ', ' | ', ' * '];
  for (const sep of separators) {
    if (result.includes(sep)) {
      const parts = result.split(sep);
      // Take the longest part (likely the merchant name)
      result = parts.reduce((a, b) => (a.length > b.length ? a : b));
    }
  }

  return result.trim();
}

/**
 * Normalize merchant name for grouping/matching
 *
 * Produces a canonical form that can be used to group transactions:
 * - "NETFLIX INC" -> "netflix"
 * - "Netflix.com" -> "netflix"
 * - "NETFLIX - SUBSCRIPTION" -> "netflix"
 */
export function normalizeMerchantName(name: string): string {
  if (!name) return '';

  let result = name.toLowerCase().trim();

  // Remove business suffixes
  const suffixPattern = new RegExp(`\\s+(${BUSINESS_SUFFIXES.join('|')})\\s*\\.?$`, 'i');
  result = result.replace(suffixPattern, '');

  // Remove common noise words
  const words = result.split(/\s+/);
  const filtered = words.filter((w) => !NOISE_WORDS.includes(w.toLowerCase()));
  result = filtered.join(' ');

  // Remove URLs/domains
  result = result.replace(/\.com|\.co|\.io|\.net|\.org/gi, '');

  // Remove special characters but keep spaces
  result = result.replace(/[^a-z0-9\s]/gi, ' ');

  // Collapse multiple spaces
  result = result.replace(/\s+/g, ' ').trim();

  // Final cleanup - remove leading/trailing non-alphanumeric
  result = result.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');

  return result;
}

/**
 * Full pipeline: extract merchant from description and normalize
 */
export function getMerchantKey(description: string): string {
  const extracted = extractMerchantFromDescription(description);
  return normalizeMerchantName(extracted);
}

/**
 * Check if two merchant names likely refer to the same entity
 */
export function areSameMerchant(name1: string, name2: string): boolean {
  const norm1 = normalizeMerchantName(name1);
  const norm2 = normalizeMerchantName(name2);

  if (!norm1 || !norm2) return false;

  // Exact match
  if (norm1 === norm2) return true;

  // One contains the other (for cases like "amazon" vs "amazon prime")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    // Only if the difference isn't too large
    const lengthRatio = Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length);
    return lengthRatio > 0.5;
  }

  return false;
}
