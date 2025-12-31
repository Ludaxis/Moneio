/**
 * Category Learner Service
 *
 * Learns from user category selections to improve future categorization accuracy.
 * Stores normalized merchant patterns mapped to categories.
 */

/**
 * Merchant category mapping record from database
 */
export interface MerchantCategoryMapping {
  id: string;
  workspaceId: string;
  merchantPattern: string;
  merchantName: string | null;
  categoryId: string;
  categoryName?: string | null;
  frequency: number;
  confidence: number;
  source: 'user' | 'imported' | 'ai_suggested';
  lastUsedAt: Date;
  createdAt: Date;
}

/**
 * Input for learning from a user's category selection
 */
export interface LearnFromSelectionInput {
  workspaceId: string;
  merchantName: string;
  categoryId: string;
  source: 'import' | 'manual_edit';
}

/**
 * Result of finding a mapping
 */
export interface MappingLookupResult {
  categoryId: string;
  categoryName: string | null;
  confidence: number;
  source: 'learned';
  frequency: number;
}

/**
 * Normalize merchant name for pattern matching
 *
 * Examples:
 * - "OpenAI - ChatGPT Subscription" → "openai"
 * - "FIGMA INC" → "figma"
 * - "Bolt by StackBlitz" → "bolt stackblitz"
 * - "Google Cloud Platform" → "google cloud"
 * - "AMAZON WEB SERVICES" → "amazon web services"
 * - "Netflix.com" → "netflix"
 */
export function normalizeMerchantName(name: string): string {
  if (!name) return '';

  let normalized = name
    // Convert to lowercase
    .toLowerCase()
    // Remove common suffixes
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|gmbh|ag|sa|srl|bv|nv)$/gi, '')
    // Remove URLs and domains
    .replace(/\.com|\.io|\.co|\.net|\.org|\.de|\.eu/gi, '')
    // Remove "by" phrases (e.g., "Bolt by StackBlitz")
    .replace(/\s+by\s+/gi, ' ')
    // Remove subscription/payment indicators
    .replace(
      /\s*(subscription|payment|charge|debit|credit|monthly|annual|yearly)\s*/gi,
      ''
    )
    // Remove date patterns (e.g., "2024-01-15")
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
    // Remove transaction IDs and reference numbers
    .replace(/[A-Z]{2,}-\d+/gi, '')
    .replace(/\b[A-F0-9]{8,}\b/gi, '')
    // Remove special characters except spaces and hyphens
    .replace(/[^\w\s-]/g, ' ')
    // Replace hyphens with spaces
    .replace(/-/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Extract the first significant word(s) - usually the brand name
  // For well-known brands, keep just the brand
  const knownBrands: Record<string, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    figma: 'figma',
    google: 'google',
    amazon: 'amazon',
    aws: 'amazon web services',
    microsoft: 'microsoft',
    azure: 'azure',
    github: 'github',
    gitlab: 'gitlab',
    atlassian: 'atlassian',
    jira: 'jira',
    confluence: 'confluence',
    slack: 'slack',
    zoom: 'zoom',
    dropbox: 'dropbox',
    notion: 'notion',
    linear: 'linear',
    vercel: 'vercel',
    netlify: 'netlify',
    cloudflare: 'cloudflare',
    stripe: 'stripe',
    shopify: 'shopify',
    spotify: 'spotify',
    netflix: 'netflix',
    adobe: 'adobe',
    canva: 'canva',
    mailchimp: 'mailchimp',
    sendgrid: 'sendgrid',
    twilio: 'twilio',
    intercom: 'intercom',
    hubspot: 'hubspot',
    salesforce: 'salesforce',
    zapier: 'zapier',
    airtable: 'airtable',
    stackblitz: 'stackblitz',
    bolt: 'bolt',
    heroku: 'heroku',
    digitalocean: 'digitalocean',
    linode: 'linode',
    upstash: 'upstash',
    supabase: 'supabase',
    planetscale: 'planetscale',
    railway: 'railway',
    render: 'render',
  };

  // Check if the normalized name starts with or contains a known brand
  const words = normalized.split(' ');
  for (const word of words) {
    if (knownBrands[word]) {
      return knownBrands[word];
    }
  }

  // Return the first 3 words max for unique pattern
  return words.slice(0, 3).join(' ');
}

/**
 * Calculate similarity score between two normalized patterns
 * Returns a score between 0 and 1
 */
export function calculatePatternSimilarity(
  pattern1: string,
  pattern2: string
): number {
  if (pattern1 === pattern2) return 1;
  if (!pattern1 || !pattern2) return 0;

  const words1 = new Set(pattern1.split(' '));
  const words2 = new Set(pattern2.split(' '));

  // Calculate Jaccard similarity
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Find the best matching category mapping for a merchant
 */
export function findBestMapping(
  merchantName: string,
  mappings: MerchantCategoryMapping[],
  minSimilarity: number = 0.8
): MappingLookupResult | null {
  if (!merchantName || mappings.length === 0) return null;

  const normalizedInput = normalizeMerchantName(merchantName);
  if (!normalizedInput) return null;

  let bestMatch: MerchantCategoryMapping | null = null;
  let bestSimilarity = 0;

  for (const mapping of mappings) {
    // Check for exact pattern match first
    if (mapping.merchantPattern === normalizedInput) {
      return {
        categoryId: mapping.categoryId,
        categoryName: mapping.categoryName || null,
        confidence: Number(mapping.confidence),
        source: 'learned',
        frequency: mapping.frequency,
      };
    }

    // Calculate similarity for fuzzy matching
    const similarity = calculatePatternSimilarity(
      normalizedInput,
      mapping.merchantPattern
    );
    if (similarity >= minSimilarity && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = mapping;
    }
  }

  if (bestMatch) {
    // Adjust confidence based on similarity and frequency
    const adjustedConfidence = Math.min(
      Number(bestMatch.confidence) * bestSimilarity,
      0.95
    );

    return {
      categoryId: bestMatch.categoryId,
      categoryName: bestMatch.categoryName || null,
      confidence: adjustedConfidence,
      source: 'learned',
      frequency: bestMatch.frequency,
    };
  }

  return null;
}

/**
 * Apply learned mappings to a batch of transactions
 */
export function applyLearnedMappings<
  T extends { id: string; description?: string; counterpartyName?: string },
>(
  transactions: T[],
  mappings: MerchantCategoryMapping[]
): {
  matched: Map<string, MappingLookupResult>;
  unmatched: T[];
} {
  const matched = new Map<string, MappingLookupResult>();
  const unmatched: T[] = [];

  for (const tx of transactions) {
    const merchantName = tx.counterpartyName || tx.description || '';
    const result = findBestMapping(merchantName, mappings);

    if (result) {
      matched.set(tx.id, result);
    } else {
      unmatched.push(tx);
    }
  }

  return { matched, unmatched };
}

/**
 * Merge a new mapping into existing mappings
 * Updates frequency if mapping exists, creates new if not
 */
export function prepareMappingUpsert(
  input: LearnFromSelectionInput,
  existingMappings: MerchantCategoryMapping[]
): {
  merchantPattern: string;
  merchantName: string;
  categoryId: string;
  isUpdate: boolean;
  newFrequency: number;
  newConfidence: number;
} {
  const merchantPattern = normalizeMerchantName(input.merchantName);

  // Find existing mapping for this pattern
  const existing = existingMappings.find(
    (m) =>
      m.workspaceId === input.workspaceId &&
      m.merchantPattern === merchantPattern
  );

  if (existing) {
    // Update existing mapping
    return {
      merchantPattern,
      merchantName: input.merchantName,
      categoryId: input.categoryId,
      isUpdate: true,
      newFrequency: existing.frequency + 1,
      // Confidence increases with frequency (max 0.99)
      newConfidence: Math.min(0.99, Number(existing.confidence) + 0.02),
    };
  }

  // Create new mapping
  return {
    merchantPattern,
    merchantName: input.merchantName,
    categoryId: input.categoryId,
    isUpdate: false,
    newFrequency: 1,
    // Start with high confidence for user selections
    newConfidence: 0.9,
  };
}

/**
 * Batch process multiple selections for learning
 * Aggregates repeated patterns to minimize database operations
 */
export function aggregateSelectionsForLearning(
  selections: Array<{
    merchantName: string;
    categoryId: string;
  }>
): Map<string, { merchantName: string; categoryId: string; count: number }> {
  const aggregated = new Map<
    string,
    { merchantName: string; categoryId: string; count: number }
  >();

  for (const selection of selections) {
    const pattern = normalizeMerchantName(selection.merchantName);
    const key = `${pattern}:${selection.categoryId}`;

    const existing = aggregated.get(key);
    if (existing) {
      existing.count++;
    } else {
      aggregated.set(key, {
        merchantName: selection.merchantName,
        categoryId: selection.categoryId,
        count: 1,
      });
    }
  }

  return aggregated;
}
