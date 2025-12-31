import { createLlmClient } from '@moneio/ai';
import { prisma } from '@moneio/db';
import { getDefaultExclusionConfig, createRowFilter } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ParsedRow = Record<string, string>;

type ColumnMapping = {
  date?: string;
  description?: string;
  amount?: string;
  balance?: string;
  reference?: string;
  direction?: string;
  currency?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  fee?: string;
  category?: string;
  status?: string;
  debit?: string;
  credit?: string;
};

interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
  currency?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  fee?: number;
  category?: string;
  status?: string;
  originalRow: ParsedRow;
  predictedCategoryId?: string;
  predictedCategoryName?: string;
  predictedConfidence?: number;
}

const requestSchema = z.object({
  workspaceId: z.string().uuid(),
  fileName: z.string().max(512).optional(),
  csvText: z.string().min(1),
  mappingOverrides: z.record(z.string(), z.string()).optional(),
});

const MAX_ROWS = 2000;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * POST /api/transactions/import/analyze
 *
 * Robust CSV analysis with LLM-assisted column mapping:
 * 1. Parses CSV (auto-detects delimiter, handles quotes and BOM)
 * 2. Uses LLM to intelligently map columns to transaction fields
 * 3. Parses amounts with auto-detection of number format
 * 4. Parses dates with multiple format support
 * 5. Filters non-transaction rows
 * 6. Predicts categories
 */
export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, csvText, mappingOverrides, fileName } = parsed.data;

    const canCreate = await hasPermission(user.id, workspaceId, 'transaction:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Parse CSV
    const { headers, rows, delimiter } = parseCsv(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${rows.length}), limit is ${MAX_ROWS}` },
        { status: 400 }
      );
    }

    console.log('[CSV Analyze] Parsed CSV:', {
      headers,
      rowCount: rows.length,
      delimiter,
      sampleRow: rows[0],
    });

    // Load workspace context
    const [categories, workspace] = await Promise.all([
      prisma.category.findMany({
        where: { workspaceId },
        select: { id: true, name: true },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { locale: true, baseCurrency: true },
      }),
    ]);

    const baseCurrency = workspace?.baseCurrency || 'EUR';

    // Step 1: Detect column mapping using LLM + heuristics
    const mapping = await detectColumnMapping(headers, rows.slice(0, 5));

    // Apply user overrides
    if (mappingOverrides) {
      Object.entries(mappingOverrides).forEach(([key, value]) => {
        if (value && headers.includes(value)) {
          (mapping as Record<string, string>)[key] = value;
        }
      });
    }

    console.log('[CSV Analyze] Column mapping:', mapping);

    // Detect number format from amount column
    const numberFormat = detectNumberFormat(rows, mapping.amount);
    console.log('[CSV Analyze] Detected number format:', numberFormat);

    // Step 2: Parse rows into transactions
    const rowFilter = createRowFilter(getDefaultExclusionConfig());
    const included: ParsedTransaction[] = [];
    const excluded: Array<{ index: number; reason: string; category?: string }> = [];

    rows.forEach((row, index) => {
      // Skip by status
      const status = mapping.status ? row[mapping.status]?.toUpperCase().trim() : undefined;
      if (status && ['REFUNDED', 'CANCELLED', 'FAILED', 'REVERSED'].includes(status)) {
        excluded.push({ index, reason: `Status ${status}`, category: 'status' });
        return;
      }

      // Parse date
      const dateValue = mapping.date ? row[mapping.date] : undefined;
      const date = parseDate(dateValue);

      // Parse amount
      const amount = parseAmount(row, mapping, numberFormat);

      // Get description
      const description = getDescription(row, mapping);

      // Apply row filter
      const filterResult = rowFilter.isExcluded({
        description,
        amount,
        status,
        rawRow: row,
      });

      if (filterResult.excluded) {
        excluded.push({
          index,
          reason: filterResult.reason || 'Filtered',
          category: filterResult.category,
        });
        return;
      }

      // Parse balance (if present)
      const balance = mapping.balance ? parseNumber(row[mapping.balance], numberFormat) : undefined;

      // Parse fee (if present)
      const fee = mapping.fee ? parseNumber(row[mapping.fee], numberFormat) : undefined;

      const tx: ParsedTransaction = {
        id: `row-${index}`,
        date,
        description,
        amount,
        balance: balance !== null ? balance : undefined,
        reference: mapping.reference ? row[mapping.reference] : undefined,
        currency: mapping.currency
          ? row[mapping.currency]?.toUpperCase().trim() || baseCurrency
          : baseCurrency,
        counterpartyName: mapping.counterpartyName ? row[mapping.counterpartyName] : undefined,
        counterpartyAccount: mapping.counterpartyAccount
          ? row[mapping.counterpartyAccount]
          : undefined,
        fee: fee !== null ? fee : undefined,
        category: mapping.category ? row[mapping.category] : undefined,
        status,
        originalRow: row,
      };

      included.push(tx);
    });

    // Step 3: Predict categories (simple heuristic for now)
    const transactions = await predictCategories(included, categories);

    return NextResponse.json({
      headers,
      rows,
      mapping,
      transactions,
      excluded,
      stats: {
        totalRows: rows.length,
        included: transactions.length,
        excluded: excluded.length,
      },
      fileName,
    });
  } catch (error) {
    console.error('[CSV Analyze] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// CSV Parsing
// ============================================================

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[]; delimiter: string } {
  // Remove BOM (Byte Order Mark)
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }
  if (cleanText.startsWith('\ufeff')) {
    cleanText = cleanText.slice(1);
  }
  cleanText = cleanText.replace(/^\xef\xbb\xbf/, '');

  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { headers: [], rows: [], delimiter: ',' };
  }

  // Detect delimiter
  const delimiter = detectDelimiter(lines.slice(0, 5));

  // Parse with quote handling
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      // Handle escaped quotes
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i++;
        continue;
      }

      // Toggle quote state
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      // Handle delimiter
      if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: ParsedRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows, delimiter };
}

function detectDelimiter(lines: string[]): string {
  // Count delimiters outside of quotes
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };

  for (const line of lines) {
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && char in counts) {
        counts[char]++;
      }
    }
  }

  // Pick the most common delimiter
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ============================================================
// Column Mapping Detection
// ============================================================

async function detectColumnMapping(
  headers: string[],
  sampleRows: ParsedRow[]
): Promise<ColumnMapping> {
  const mapping: ColumnMapping = {};

  // First, try LLM-based detection
  try {
    const llmClient = createLlmClient();
    const llmMapping = await detectMappingWithLlm(llmClient, headers, sampleRows);
    if (llmMapping) {
      Object.assign(mapping, llmMapping);
      console.log('[CSV Analyze] LLM mapping result:', llmMapping);
    }
  } catch (error) {
    console.warn('[CSV Analyze] LLM mapping failed, using heuristics:', error);
  }

  // Fill in any missing fields with heuristic detection
  const heuristicMapping = detectMappingByHeuristics(headers, sampleRows);

  // Only use heuristic values for fields not already set by LLM
  Object.entries(heuristicMapping).forEach(([key, value]) => {
    if (!mapping[key as keyof ColumnMapping] && value) {
      (mapping as Record<string, string>)[key] = value;
    }
  });

  return mapping;
}

async function detectMappingWithLlm(
  llmClient: ReturnType<typeof createLlmClient>,
  headers: string[],
  sampleRows: ParsedRow[]
): Promise<Partial<ColumnMapping> | null> {
  const sampleData = sampleRows.slice(0, 3).map((row) => headers.map((h) => row[h] || '(empty)'));

  const prompt = `Analyze this CSV to map columns to transaction fields.

HEADERS: ${JSON.stringify(headers)}

SAMPLE DATA (first 3 rows):
${sampleData.map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`).join('\n')}

Map each header to the appropriate transaction field. Return a JSON object with these possible keys:
- date: Column containing transaction date (look for dates like "2025-12-27", "01-01-2025", "2025-12-27 10:01:16")
- description: Column with transaction description, narration, or memo
- amount: Column with the transaction amount (look for numbers like "12.64", "-224,75", "500.00")
- balance: Column with account balance (NOT transaction ID or reference numbers)
- reference: Column with transaction reference/ID
- direction: Column indicating debit/credit (values like D/C, IN/OUT, DEBIT/CREDIT)
- currency: Column with currency code (EUR, USD, etc.)
- counterpartyName: Column with payee/payer name (merchant, recipient, sender)
- counterpartyAccount: Column with account number/IBAN
- fee: Column with transaction fee
- category: Column with expense category
- status: Column with transaction status (COMPLETED, REFUNDED, etc.)
- debit: Column specifically for debit amounts (if amounts are split)
- credit: Column specifically for credit amounts (if amounts are split)

IMPORTANT RULES:
1. For amount, look for columns with actual monetary values, NOT dates or IDs
2. Transaction IDs like "CARD_TRANSACTION-3275710720" are NOT balance values
3. Dates like "2025-12-27" should ONLY map to "date", NOT "amount"
4. If there's a "Source amount" or similar, that's likely the amount column
5. Look for columns named "Summa", "Amount", "Value" for amounts
6. For Wise exports, use "Source amount (after fees)" or "Target amount (after fees)" for amount
7. For Wise exports, use "Target name" for counterpartyName/description

Return ONLY a valid JSON object mapping field names to header names, nothing else.`;

  try {
    const text = await llmClient.complete(prompt);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate that mapped columns exist in headers
      const validated: Partial<ColumnMapping> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value === 'string' && headers.includes(value)) {
          (validated as Record<string, string>)[key] = value;
        }
      });

      return validated;
    }
  } catch (error) {
    console.error('[CSV Analyze] LLM parsing error:', error);
  }

  return null;
}

function detectMappingByHeuristics(
  headers: string[],
  sampleRows: ParsedRow[]
): Partial<ColumnMapping> {
  const detected: Partial<ColumnMapping> = {};
  const normalized = headers.map((h) => h.toLowerCase().trim());

  // Helper to find column by patterns
  const findColumn = (patterns: string[]): string | undefined => {
    for (const pattern of patterns) {
      const patternLower = pattern.toLowerCase();
      // Exact match first
      const exactIdx = normalized.findIndex((h) => h === patternLower);
      if (exactIdx >= 0) return headers[exactIdx];
      // Contains match
      const containsIdx = normalized.findIndex((h) => h.includes(patternLower));
      if (containsIdx >= 0) return headers[containsIdx];
    }
    return undefined;
  };

  // Date patterns (prioritize exact matches)
  const datePatterns = [
    'created on',
    'finished on',
    'booking date',
    'value date',
    'transaction date',
    'posted date',
    'date',
    'makse kuupäev',
    'kuupäev',
    'datum',
  ];
  detected.date = findColumn(datePatterns);

  // Amount patterns (be specific to avoid matching dates)
  const amountPatterns = [
    'source amount (after fees)',
    'target amount (after fees)',
    'source amount',
    'target amount',
    'summa',
    'amount',
    'value',
    'betrag',
  ];
  detected.amount = findColumn(amountPatterns);

  // Description patterns
  const descPatterns = ['selgitus', 'description', 'narrative', 'memo', 'details', 'buchungstext'];
  detected.description = findColumn(descPatterns);

  // Counterparty name patterns
  const counterpartyPatterns = [
    'target name',
    'source name',
    'saaja/maksja nimi',
    'saaja nimi',
    'maksja nimi',
    'payee',
    'payer',
    'beneficiary',
    'merchant',
    'counterparty',
    'recipient',
  ];
  detected.counterpartyName = findColumn(counterpartyPatterns);

  // If no description but have counterparty, use counterparty as description
  if (!detected.description && detected.counterpartyName) {
    detected.description = detected.counterpartyName;
  }

  // Direction patterns
  const dirPatterns = ['deebet/kreedit (d/c)', 'deebet/kreedit', 'd/c', 'direction', 'type'];
  detected.direction = findColumn(dirPatterns);

  // Currency patterns
  const currencyPatterns = [
    'valuuta tähis',
    'source currency',
    'target currency',
    'currency',
    'ccy',
    'währung',
  ];
  detected.currency = findColumn(currencyPatterns);

  // Status patterns
  const statusPatterns = ['status', 'state', 'olek'];
  detected.status = findColumn(statusPatterns);

  // Reference patterns
  const refPatterns = [
    'arhiveerimistunnus',
    'viitenumber',
    'reference',
    'ref',
    'transaction id',
    'id',
  ];
  detected.reference = findColumn(refPatterns);

  // Fee patterns
  const feePatterns = ['teenustasu', 'source fee amount', 'fee', 'charge', 'commission'];
  detected.fee = findColumn(feePatterns);

  // Category patterns
  const categoryPatterns = ['category', 'kategooria', 'expense type'];
  detected.category = findColumn(categoryPatterns);

  // Counterparty account patterns
  const accountPatterns = ['saaja/maksja konto', 'beneficiary account', 'iban', 'account'];
  detected.counterpartyAccount = findColumn(accountPatterns);

  // Balance patterns (be careful not to match IDs)
  const balancePatterns = ['balance', 'saldo', 'jääk', 'running balance'];
  detected.balance = findColumn(balancePatterns);

  // Data-based validation: Check if detected columns make sense
  validateMapping(detected, headers, sampleRows);

  return detected;
}

function validateMapping(
  mapping: Partial<ColumnMapping>,
  headers: string[],
  sampleRows: ParsedRow[]
): void {
  // Validate amount column contains actual numbers, not IDs or dates
  if (mapping.amount) {
    const values = sampleRows.map((row) => row[mapping.amount!]).filter(Boolean);
    const hasLetters = values.some((v) => /[a-zA-Z]/.test(v) && !/^[CDEURO]+$/i.test(v));

    if (hasLetters) {
      console.warn('[CSV Analyze] Amount column contains letters, clearing:', mapping.amount);
      delete mapping.amount;

      // Try to find a better amount column
      for (const header of headers) {
        const vals = sampleRows.map((row) => row[header]).filter(Boolean);
        const looksLikeAmount = vals.every((v) => /^-?[\d\s.,()]+$/.test(v) && v.length < 20);
        if (looksLikeAmount && vals.length > 0) {
          mapping.amount = header;
          console.log('[CSV Analyze] Found better amount column:', header);
          break;
        }
      }
    }
  }

  // Validate date column contains dates, not amounts
  if (mapping.date) {
    const values = sampleRows.map((row) => row[mapping.date!]).filter(Boolean);
    const looksLikeDate = values.some((v) => /\d{2,4}[-./]\d{1,2}[-./]\d{1,4}/.test(v));

    if (!looksLikeDate) {
      console.warn('[CSV Analyze] Date column does not look like dates:', mapping.date);
      delete mapping.date;
    }
  }

  // Make sure balance is not an ID field
  if (mapping.balance) {
    const values = sampleRows.map((row) => row[mapping.balance!]).filter(Boolean);
    const hasLetters = values.some((v) => /[a-zA-Z]/.test(v));

    if (hasLetters) {
      console.warn('[CSV Analyze] Balance column contains letters, clearing:', mapping.balance);
      delete mapping.balance;
    }
  }
}

// ============================================================
// Number Format Detection and Parsing
// ============================================================

interface NumberFormat {
  decimalSeparator: '.' | ',';
  thousandsSeparator: ',' | '.' | ' ' | '';
}

function detectNumberFormat(rows: ParsedRow[], amountColumn?: string): NumberFormat {
  if (!amountColumn) {
    return { decimalSeparator: '.', thousandsSeparator: ',' };
  }

  const values = rows
    .map((row) => row[amountColumn])
    .filter((v) => v && /[\d.,]/.test(v))
    .slice(0, 20);

  let commaAsDecimal = 0;
  let dotAsDecimal = 0;

  for (const value of values) {
    const cleaned = value.replace(/[^\d.,]/g, '');

    // If comma is the last separator and has 1-2 digits after, it's decimal
    const commaMatch = cleaned.match(/,(\d{1,2})$/);
    if (commaMatch) commaAsDecimal++;

    // If dot is the last separator and has 1-2 digits after, it's decimal
    const dotMatch = cleaned.match(/\.(\d{1,2})$/);
    if (dotMatch) dotAsDecimal++;
  }

  // European format uses comma as decimal (e.g., "1.234,56" or "1234,56")
  if (commaAsDecimal > dotAsDecimal) {
    return { decimalSeparator: ',', thousandsSeparator: '.' };
  }

  // US/UK format uses dot as decimal (e.g., "1,234.56" or "1234.56")
  return { decimalSeparator: '.', thousandsSeparator: ',' };
}

function parseNumber(value: string | undefined, format: NumberFormat): number | null {
  if (!value) return null;

  // Remove currency symbols and extra whitespace
  let cleaned = value.replace(/[^\d.,\-+()'\s]/g, '').trim();
  if (!cleaned) return null;

  // Handle parentheses as negative (accounting format)
  const isNegativeParens = cleaned.startsWith('(') && cleaned.endsWith(')');
  if (isNegativeParens) {
    cleaned = cleaned.slice(1, -1);
  }

  // Handle leading minus
  const isNegative = cleaned.startsWith('-') || isNegativeParens;
  cleaned = cleaned.replace(/^[-+]/, '');

  // Apply number format
  if (format.decimalSeparator === ',') {
    // European format: 1.234,56 -> 1234.56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // US format: 1,234.56 -> 1234.56
    cleaned = cleaned.replace(/,/g, '');
  }

  // Remove spaces (thousand separators)
  cleaned = cleaned.replace(/\s/g, '');

  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return null;

  return isNegative ? -Math.abs(num) : num;
}

function parseAmount(row: ParsedRow, mapping: ColumnMapping, format: NumberFormat): number {
  // Try single amount column
  if (mapping.amount) {
    const value = row[mapping.amount];
    const amount = parseNumber(value, format);

    if (amount !== null) {
      // Check direction column to determine sign
      if (mapping.direction) {
        const dir = row[mapping.direction]?.toUpperCase().trim();
        if (dir === 'D' || dir === 'OUT' || dir === 'DEBIT') {
          return -Math.abs(amount);
        } else if (dir === 'C' || dir === 'IN' || dir === 'CREDIT') {
          return Math.abs(amount);
        }
      }
      return amount;
    }
  }

  // Try split debit/credit columns
  if (mapping.debit || mapping.credit) {
    const debit = mapping.debit ? parseNumber(row[mapping.debit], format) : null;
    const credit = mapping.credit ? parseNumber(row[mapping.credit], format) : null;

    if (debit !== null && debit !== 0) return -Math.abs(debit);
    if (credit !== null && credit !== 0) return Math.abs(credit);
  }

  return 0;
}

// ============================================================
// Date Parsing
// ============================================================

function parseDate(value: string | undefined): string {
  if (!value) return new Date().toISOString().split('T')[0];

  const trimmed = value.trim();
  const today = new Date();

  // ISO format with optional time: 2025-12-27 or 2025-12-27 10:01:16
  const isoMatch = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // European format: DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY
  const euMatch = trimmed.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Short European format: DD-MM-YY
  const euShortMatch = trimmed.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2})$/);
  if (euShortMatch) {
    const [, day, month, yy] = euShortMatch;
    const year = parseInt(yy, 10) <= 50 ? `20${yy}` : `19${yy}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // US format: MM/DD/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    // Validate that month is <= 12 (otherwise it might be DD/MM/YYYY)
    if (parseInt(month, 10) <= 12) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Try native Date parsing as fallback
  const parsed = new Date(trimmed);
  if (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() >= 1900 &&
    parsed.getFullYear() <= 2100
  ) {
    return parsed.toISOString().split('T')[0];
  }

  // Default to today
  return today.toISOString().split('T')[0];
}

// ============================================================
// Description Extraction
// ============================================================

function getDescription(row: ParsedRow, mapping: ColumnMapping): string {
  // Primary: use description column
  if (mapping.description && row[mapping.description]) {
    return row[mapping.description];
  }

  // Fallback: use counterparty name
  if (mapping.counterpartyName && row[mapping.counterpartyName]) {
    return row[mapping.counterpartyName];
  }

  // Last resort: find any column with text content
  const textColumns = Object.entries(row).filter(
    ([_, value]) =>
      value && value.length > 5 && /[a-zA-Z]/.test(value) && !/^\d{4}-\d{2}-\d{2}/.test(value) // Not a date
  );

  if (textColumns.length > 0) {
    // Prefer longer values
    textColumns.sort((a, b) => b[1].length - a[1].length);
    return textColumns[0][1];
  }

  return '(no description)';
}

// ============================================================
// Category Prediction (Simple Heuristic)
// ============================================================

async function predictCategories(
  transactions: ParsedTransaction[],
  categories: Array<{ id: string; name: string }>
): Promise<ParsedTransaction[]> {
  if (categories.length === 0) return transactions;

  // Simple keyword matching
  const categoryKeywords: Record<string, string[]> = {
    'Software and web hosting': [
      'google cloud',
      'aws',
      'vercel',
      'supabase',
      'anthropic',
      'openai',
      'claude',
      'slack',
      'notion',
      'figma',
      'github',
      'netlify',
      'render',
      'heroku',
      'digital ocean',
    ],
    Marketing: [
      'google ads',
      'facebook',
      'meta',
      'instagram',
      'tiktok',
      'linkedin ads',
      'advertising',
    ],
    'Office expenses': ['office', 'supplies', 'equipment', 'furniture'],
    'Contract services': ['consulting', 'freelance', 'contractor'],
    Travel: ['hotel', 'flight', 'airline', 'airbnb', 'booking.com', 'uber', 'lyft', 'taxi'],
    'Food and meals': ['restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'food'],
    'Internal Transfer': ['transfer', 'internal', 'own account'],
    'Bank fees': ['fee', 'charge', 'commission', 'interest'],
  };

  return transactions.map((tx) => {
    const desc = (tx.description + ' ' + (tx.counterpartyName || '')).toLowerCase();

    // Check existing category from CSV
    if (tx.category) {
      const match = categories.find((c) => c.name.toLowerCase() === tx.category?.toLowerCase());
      if (match) {
        return {
          ...tx,
          predictedCategoryId: match.id,
          predictedCategoryName: match.name,
          predictedConfidence: 90,
        };
      }
    }

    // Try keyword matching
    for (const [categoryName, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((kw) => desc.includes(kw))) {
        const match = categories.find(
          (c) =>
            c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
            categoryName.toLowerCase().includes(c.name.toLowerCase())
        );
        if (match) {
          return {
            ...tx,
            predictedCategoryId: match.id,
            predictedCategoryName: match.name,
            predictedConfidence: 60,
          };
        }
      }
    }

    // Default: first category or none
    return {
      ...tx,
      predictedCategoryId: undefined,
      predictedCategoryName: undefined,
      predictedConfidence: 20,
    };
  });
}
