/**
 * CSV Parsing Utilities
 * Zero-dependency CSV parser for bank statement imports
 */

export interface CsvParseOptions {
  delimiter?: string; // Auto-detect if not specified
  hasHeader?: boolean;
  trimValues?: boolean;
}

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
  rowCount: number;
}

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  balance?: string;
  reference?: string;
}

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD format
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
  rawRow: Record<string, string>;
}

export interface TransactionParseResult {
  transactions: ParsedTransaction[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

/**
 * Detect the delimiter used in a CSV file
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || '';

  // Count occurrences of common delimiters in first line
  const delimiters = [',', ';', '\t', '|'];
  const counts = delimiters.map((d) => ({
    delimiter: d,
    count: (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length,
  }));

  // Sort by count descending
  counts.sort((a, b) => b.count - a.count);

  // Return the most common, defaulting to comma
  return counts[0]?.count > 0 ? counts[0].delimiter : ',';
}

/**
 * Parse a single CSV line, handling quoted fields
 */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse a CSV file into headers and rows
 */
export function parseCsv(text: string, options: CsvParseOptions = {}): CsvParseResult {
  const {
    delimiter = detectDelimiter(text),
    hasHeader = true,
    trimValues = true,
  } = options;

  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter, rowCount: 0 };
  }

  const parsedLines = lines.map((line) => parseCsvLine(line, delimiter));

  const headers = hasHeader
    ? parsedLines[0].map((h) => (trimValues ? h.trim() : h))
    : parsedLines[0].map((_, i) => `column_${i + 1}`);

  const dataLines = hasHeader ? parsedLines.slice(1) : parsedLines;

  const rows = dataLines.map((values) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = trimValues ? (values[i] || '').trim() : (values[i] || '');
    });
    return row;
  });

  return {
    headers,
    rows,
    delimiter,
    rowCount: rows.length,
  };
}

/**
 * Auto-detect column mapping based on header names
 */
export function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const mapping: Partial<ColumnMapping> = {};

  // Date patterns (multilingual)
  const datePatterns = [
    'date', 'datum', 'kuupäev', 'تاريخ', 'تاریخ',
    'posted', 'value date', 'transaction date', 'booking date',
    'päev', 'jour', 'fecha',
  ];
  const dateIdx = normalized.findIndex((h) =>
    datePatterns.some((p) => h.includes(p))
  );
  if (dateIdx >= 0) mapping.date = headers[dateIdx];

  // Description patterns
  const descPatterns = [
    'description', 'memo', 'kirjeldus', 'توضیحات', 'توضيحات',
    'details', 'narrative', 'text', 'reference text',
    'selgitus', 'libellé', 'concepto', 'bezeichnung',
  ];
  const descIdx = normalized.findIndex((h) =>
    descPatterns.some((p) => h.includes(p))
  );
  if (descIdx >= 0) mapping.description = headers[descIdx];

  // Amount patterns
  const amountPatterns = [
    'amount', 'summa', 'مبلغ', 'value', 'betrag',
    'debit', 'credit', 'sum', 'montant', 'importe',
  ];
  const amountIdx = normalized.findIndex((h) =>
    amountPatterns.some((p) => h.includes(p))
  );
  if (amountIdx >= 0) mapping.amount = headers[amountIdx];

  // Balance patterns
  const balancePatterns = [
    'balance', 'saldo', 'موجودی', 'running balance',
    'solde', 'saldo final', 'kontostand',
  ];
  const balanceIdx = normalized.findIndex((h) =>
    balancePatterns.some((p) => h.includes(p))
  );
  if (balanceIdx >= 0) mapping.balance = headers[balanceIdx];

  // Reference patterns
  const refPatterns = [
    'reference', 'ref', 'viide', 'مرجع',
    'transaction id', 'id', 'numéro',
  ];
  const refIdx = normalized.findIndex((h) =>
    refPatterns.some((p) => h.includes(p))
  );
  if (refIdx >= 0) mapping.reference = headers[refIdx];

  return mapping;
}

/**
 * Parse amount string to number, handling various formats
 */
export function parseAmount(value: string): number {
  if (!value) return 0;

  // Remove currency symbols and whitespace
  let cleaned = value.replace(/[^\d.,\-()]/g, '');

  // Handle parentheses as negative (common in accounting)
  const isNegative = cleaned.includes('(') && cleaned.includes(')');
  if (isNegative) {
    cleaned = cleaned.replace(/[()]/g, '');
  }

  // Determine decimal separator
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European format: 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Comma as decimal, no dots: 1234,56
    cleaned = cleaned.replace(',', '.');
  }
  // else: American format or no decimal, use as-is

  let result = parseFloat(cleaned) || 0;

  if (isNegative && result > 0) {
    result = -result;
  }

  return result;
}

/**
 * Parse date string to YYYY-MM-DD format for CSV imports
 */
export function parseCsvDate(value: string): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Try standard Date parsing
  const date = new Date(trimmed);
  if (!isNaN(date.getTime()) && trimmed.length >= 8) {
    return date.toISOString().split('T')[0];
  }

  // Try various formats
  const patterns: Array<{ regex: RegExp; format: 'DMY' | 'MDY' | 'YMD' }> = [
    { regex: /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/, format: 'DMY' },
    { regex: /^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/, format: 'DMY' },
    { regex: /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/, format: 'YMD' },
  ];

  for (const { regex, format } of patterns) {
    const match = trimmed.match(regex);
    if (match) {
      let year: number, month: number, day: number;

      if (format === 'DMY') {
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
        if (year < 100) {
          year += year > 50 ? 1900 : 2000;
        }
      } else if (format === 'YMD') {
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        continue;
      }

      // Validate
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  return null;
}

/**
 * Parse CSV rows into structured transactions
 */
export function parseTransactions(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): TransactionParseResult {
  const transactions: ParsedTransaction[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // 1-indexed, skip header

    // Parse date
    const dateValue = row[mapping.date];
    const date = parseCsvDate(dateValue);
    if (!date) {
      errors.push({ row: rowNum, message: `Invalid date: "${dateValue}"` });
      return;
    }

    // Parse description
    const description = row[mapping.description]?.trim() || '';
    if (!description) {
      warnings.push({ row: rowNum, message: 'Empty description' });
    }

    // Parse amount
    const amountValue = row[mapping.amount];
    const amount = parseAmount(amountValue);
    if (amount === 0 && !amountValue?.includes('0')) {
      warnings.push({ row: rowNum, message: `Could not parse amount: "${amountValue}"` });
    }

    // Parse optional fields
    const balance = mapping.balance ? parseAmount(row[mapping.balance]) : undefined;
    const reference = mapping.reference ? row[mapping.reference]?.trim() : undefined;

    transactions.push({
      date,
      description,
      amount,
      balance: balance !== 0 ? balance : undefined,
      reference: reference || undefined,
      rawRow: row,
    });
  });

  return { transactions, errors, warnings };
}

/**
 * Generate a unique hash for transaction deduplication
 */
export function generateTransactionHash(tx: {
  date: string;
  description: string;
  amount: number;
  reference?: string;
}): string {
  // Simple hash for deduplication
  // In production, use crypto.createHash('sha256')
  const input = `${tx.date}|${tx.description}|${tx.amount}|${tx.reference || ''}`;

  // Simple string hash (not cryptographic, but sufficient for dedup)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}
