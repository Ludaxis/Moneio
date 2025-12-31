import { CsvHeaderNormalizer, HeuristicCategorizer, createLlmClient } from '@moneio/ai';
import { prisma } from '@moneio/db';
import {
  AmountParser,
  createRowFilter,
  detectAmountConfig,
  getDefaultExclusionConfig,
} from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
 * End-to-end CSV analysis:
 * - Parses CSV (delimiter + quote aware)
 * - Detects column mappings (AI + heuristics + data patterns)
 * - Parses amounts (single or split debit/credit) and dates
 * - Filters non-transaction rows
 * - Predicts categories heuristically
 */
export async function POST(request: Request) {
  try {
    // Basic payload size guard
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

    const { headers, rows } = parseCsv(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${rows.length}), limit is ${MAX_ROWS}` },
        { status: 400 }
      );
    }

    // Load workspace context (categories + locale/currency)
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

    // Prepare AI client if available
    let llmClient: ReturnType<typeof createLlmClient> | undefined;
    try {
      llmClient = createLlmClient();
    } catch {
      llmClient = undefined;
    }

    // Step 1: AI header normalization (optional)
    let aiMapping: Partial<ColumnMapping> = {};
    if (llmClient) {
      try {
        const normalizer = new CsvHeaderNormalizer(llmClient);
        const aiResult = await normalizer.normalizeHeaders(
          headers,
          rows.slice(0, 5).map((r) => headers.map((h) => r[h] || ''))
        );
        aiMapping = mappingFromNormalized(aiResult.mappings);
      } catch (error) {
        console.error('[CSV Analyze] AI header normalization failed:', error);
      }
    }

    // Step 2: Heuristic + data-based detection
    const heuristicMapping = autoDetectMapping(headers);
    const dataMapping = detectByDataPatterns(headers, rows);

    // Step 3: Merge with overrides (overrides > AI > heuristics > data)
    const overrides = mappingOverrides ? normalizeMappingOverrides(mappingOverrides) : {};
    const mapping: ColumnMapping = {
      date: overrides.date || aiMapping.date || heuristicMapping.date || dataMapping.date,
      description:
        overrides.description ||
        aiMapping.description ||
        heuristicMapping.description ||
        dataMapping.description,
      amount: overrides.amount || aiMapping.amount || heuristicMapping.amount || dataMapping.amount,
      balance:
        overrides.balance || aiMapping.balance || heuristicMapping.balance || dataMapping.balance,
      reference:
        overrides.reference ||
        aiMapping.reference ||
        heuristicMapping.reference ||
        dataMapping.reference,
      direction:
        overrides.direction ||
        aiMapping.direction ||
        heuristicMapping.direction ||
        dataMapping.direction,
      currency:
        overrides.currency ||
        aiMapping.currency ||
        heuristicMapping.currency ||
        dataMapping.currency,
      counterpartyName:
        overrides.counterpartyName ||
        aiMapping.counterpartyName ||
        heuristicMapping.counterpartyName ||
        dataMapping.counterpartyName,
      counterpartyAccount:
        overrides.counterpartyAccount ||
        aiMapping.counterpartyAccount ||
        heuristicMapping.counterpartyAccount ||
        dataMapping.counterpartyAccount,
      fee: overrides.fee || aiMapping.fee || heuristicMapping.fee || dataMapping.fee,
      category:
        overrides.category ||
        aiMapping.category ||
        heuristicMapping.category ||
        dataMapping.category,
      status: overrides.status || aiMapping.status || heuristicMapping.status || dataMapping.status,
      debit: overrides.debit || aiMapping.debit || heuristicMapping.debit || dataMapping.debit,
      credit: overrides.credit || aiMapping.credit || heuristicMapping.credit || dataMapping.credit,
    };

    // Step 4: Parse rows into transactions
    const amountParser = buildAmountParser(headers, mapping);
    const rowFilter = createRowFilter(getDefaultExclusionConfig());

    const included: ParsedTransaction[] = [];
    const excluded: Array<{ index: number; reason: string; category?: string }> = [];

    rows.forEach((row, index) => {
      const status = mapping.status ? row[mapping.status]?.toUpperCase() : undefined;
      if (status && ['REFUNDED', 'CANCELLED', 'FAILED'].includes(status)) {
        excluded.push({ index, reason: `Status ${status}`, category: 'status' });
        return;
      }

      const description =
        (mapping.description && row[mapping.description]) ||
        (mapping.counterpartyName && row[mapping.counterpartyName]) ||
        '(no description)';

      const amount = parseAmountFromRow(row, mapping, amountParser);
      const balance = mapping.balance ? parseAmountSafe(row[mapping.balance]) : undefined;
      const fee = mapping.fee ? parseAmountSafe(row[mapping.fee]) : undefined;

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

      const tx: ParsedTransaction = {
        id: `row-${index}`,
        date: mapping.date ? parseDate(row[mapping.date]) : new Date().toISOString().split('T')[0],
        description,
        amount,
        balance,
        reference: mapping.reference ? row[mapping.reference] : undefined,
        currency: mapping.currency ? row[mapping.currency] || baseCurrency : baseCurrency,
        counterpartyName: mapping.counterpartyName ? row[mapping.counterpartyName] : undefined,
        counterpartyAccount: mapping.counterpartyAccount
          ? row[mapping.counterpartyAccount]
          : undefined,
        fee,
        category: mapping.category ? row[mapping.category] : undefined,
        status,
        originalRow: row,
      };

      included.push(tx);
    });

    // Step 5: Predict categories heuristically (non-blocking)
    const predicted = await predictCategories(
      included,
      categories,
      workspace?.locale || 'en',
      baseCurrency,
      workspaceId
    );
    const transactions = included.map((tx) => {
      const pred = predicted.get(tx.id);
      return pred
        ? {
            ...tx,
            predictedCategoryId: pred.categoryId || undefined,
            predictedCategoryName: pred.categoryName || undefined,
            predictedConfidence: pred.confidence,
          }
        : tx;
    });

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

// ------------ Helpers ------------

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
}

function normalizeMappingOverrides(overrides: Record<string, string>): ColumnMapping {
  const normalized: ColumnMapping = {};
  Object.entries(overrides).forEach(([key, value]) => {
    const k = key as keyof ColumnMapping;
    normalized[k] = value;
  });
  return normalized;
}

function mappingFromNormalized(
  mappings: Array<{ original: string; normalized: string | null }>
): Partial<ColumnMapping> {
  const result: Partial<ColumnMapping> = {};
  mappings.forEach((m) => {
    if (!m.normalized) return;
    const key = m.normalized as keyof ColumnMapping;
    result[key] = m.original;
  });
  return result;
}

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  // Remove BOM (Byte Order Mark) if present - common in Excel exports
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }
  // Also handle UTF-8 BOM that appears as characters
  if (cleanText.startsWith('\ufeff')) {
    cleanText = cleanText.slice(1);
  }
  // Handle common BOM byte sequences that might appear as garbage characters
  cleanText = cleanText.replace(/^\xef\xbb\xbf/, '');

  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines.slice(0, 5));

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i++; // skip escaped quote
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

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

  return { headers, rows };
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.join('\n');
  const counts: Record<string, number> = {
    ',': (sample.match(/,/g) || []).length,
    ';': (sample.match(/;/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
  };

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

function buildAmountParser(headers: string[], mapping: ColumnMapping): AmountParser {
  const detectedConfig = detectAmountConfig(headers);

  // Prefer explicit debit/credit mapping if provided
  if (mapping.debit || mapping.credit || detectedConfig.type === 'split') {
    return new AmountParser({
      type: 'split',
      debitColumn: mapping.debit || detectedConfig.debitColumn,
      creditColumn: mapping.credit || detectedConfig.creditColumn,
      signConvention: detectedConfig.signConvention || 'absolute',
      decimalSeparator: 'auto',
      thousandsSeparator: 'auto',
    });
  }

  return new AmountParser({
    type: 'single',
    amountColumn: mapping.amount || detectedConfig.amountColumn,
    signConvention: detectedConfig.signConvention || 'negative-debit',
    decimalSeparator: 'auto',
    thousandsSeparator: 'auto',
  });
}

function parseAmountFromRow(row: ParsedRow, mapping: ColumnMapping, parser: AmountParser): number {
  const parsed = parser.parse(row);
  let amount = parsed.amount ?? 0;

  // Direction column overrides sign when present
  if (mapping.direction && row[mapping.direction]) {
    const dir = row[mapping.direction].toUpperCase().trim();
    if (dir === 'D' || dir === 'OUT' || dir === 'DEBIT') {
      amount = -Math.abs(amount);
    } else if (dir === 'C' || dir === 'IN' || dir === 'CREDIT') {
      amount = Math.abs(amount);
    }
  }

  // Fallback to raw amount column if parser returned null
  if (parsed.amount === null && mapping.amount) {
    const fallback = parseAmountSafe(row[mapping.amount]);
    amount = fallback ?? 0;
  }

  return amount;
}

function parseAmountSafe(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\d.,\-+()'\s]/g, '').trim();
  if (!cleaned) return undefined;

  // Handle parentheses as negative
  const isNegativeParens = cleaned.startsWith('(') && cleaned.endsWith(')');
  let normalized = cleaned.replace(/[()]/g, '');

  const commaCount = (normalized.match(/,/g) || []).length;
  const dotCount = (normalized.match(/\./g) || []).length;
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (commaCount && dotCount) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (commaCount === 1 && dotCount === 0) {
    const after = normalized.slice(lastComma + 1);
    normalized = after.length <= 2 ? normalized.replace(',', '.') : normalized.replace(/,/g, '');
  } else if (dotCount === 1 && commaCount === 0) {
    const after = normalized.slice(lastDot + 1);
    normalized = after.length <= 2 ? normalized : normalized.replace(/\./g, '');
  }

  const num = parseFloat(normalized);
  if (Number.isNaN(num)) return undefined;
  return isNegativeParens ? -Math.abs(num) : num;
}

function parseDate(value: string | undefined): string {
  if (!value) return new Date().toISOString().split('T')[0];

  const trimmed = value.trim();
  const currentYear = new Date().getFullYear();

  const isoMatch = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const ddmmyyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/);
  if (ddmmyyMatch) {
    const [, day, month, yy] = ddmmyyMatch;
    const year = parseInt(yy, 10) <= 50 ? `20${yy}` : `19${yy}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const ddmmMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (ddmmMatch) {
    const [, day, month] = ddmmMatch;
    return `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
    return date.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const detected: Partial<ColumnMapping> = {};

  const normalize = (str: string): string =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

  const normalizedFuzzy = headers.map(normalize);

  const findColumn = (patterns: string[]): number => {
    for (const pattern of patterns) {
      const idx = normalized.findIndex((h) => h === pattern);
      if (idx >= 0) return idx;
    }
    for (const pattern of patterns) {
      const idx = normalized.findIndex((h) => h.includes(pattern));
      if (idx >= 0) return idx;
    }
    for (const pattern of patterns) {
      const normalizedPattern = normalize(pattern);
      const idx = normalizedFuzzy.findIndex(
        (h) => h.includes(normalizedPattern) || normalizedPattern.includes(h)
      );
      if (idx >= 0) return idx;
    }
    for (const pattern of patterns) {
      const words = normalize(pattern)
        .split(/\s+/)
        .filter((w) => w.length > 3);
      for (const word of words) {
        const idx = normalizedFuzzy.findIndex((h) => h.includes(word));
        if (idx >= 0) return idx;
      }
    }
    return -1;
  };

  const datePatterns = [
    'makse kuupäev',
    'makse kuup',
    'created on',
    'finished on',
    'booking date',
    'value date',
    'transaction date',
    'posted date',
    'posted at',
    'posted',
    'date',
    'datum',
    'kuupäev',
    'kuup',
    'تاريخ',
    'päev',
    'buchungstag',
    'wertstellung',
  ];
  const dateIdx = findColumn(datePatterns);
  if (dateIdx >= 0) detected.date = headers[dateIdx];

  const descPatterns = [
    'selgitus',
    'description',
    'narrative',
    'memo',
    'details',
    'text',
    'kirjeldus',
    'توضیحات',
    'verwendungszweck',
    'buchungstext',
    'transaction details',
    'payment details',
    'particulars',
  ];
  const descIdx = findColumn(descPatterns);
  if (descIdx >= 0) detected.description = headers[descIdx];

  const counterpartyPatterns = [
    'saaja/maksja nimi',
    'target name',
    'source name',
    'merchant',
    'payee',
    'payer',
    'beneficiary',
    'counterparty',
    'vendor',
    'sender',
    'recipient',
    'nimi',
    'empfänger',
    'auftraggeber',
    'begunstigde',
  ];
  const counterpartyIdx = findColumn(counterpartyPatterns);
  if (counterpartyIdx >= 0) detected.counterpartyName = headers[counterpartyIdx];

  if (!detected.description && detected.counterpartyName) {
    detected.description = detected.counterpartyName;
  }

  const counterpartyAccountPatterns = [
    'saaja/maksja konto',
    'beneficiary account',
    'counterparty account',
    'payee account',
    'iban',
    'account number',
    'konto',
  ];
  const counterpartyAccountIdx = findColumn(counterpartyAccountPatterns);
  if (counterpartyAccountIdx >= 0) detected.counterpartyAccount = headers[counterpartyAccountIdx];

  const amountPatterns = [
    'summa',
    'source amount (after fees)',
    'target amount (after fees)',
    'source amount',
    'target amount',
    'amount',
    'مبلغ',
    'value',
    'sum',
    'betrag',
    'bedrag',
    'debit',
    'credit',
  ];
  const amountIdx = findColumn(amountPatterns);
  if (amountIdx >= 0) detected.amount = headers[amountIdx];

  const debitIdx = findColumn(['debit', 'withdrawal', 'ausgabe', 'deebet', 'soll', 'debet', 'out']);
  if (debitIdx >= 0) detected.debit = headers[debitIdx];

  const creditIdx = findColumn([
    'credit',
    'deposit',
    'einnahme',
    'kreedit',
    'haben',
    'kredit',
    'in',
  ]);
  if (creditIdx >= 0) detected.credit = headers[creditIdx];

  const balancePatterns = ['balance', 'saldo', 'موجودی', 'running balance', 'jääk', 'kontostand'];
  const balanceIdx = findColumn(balancePatterns);
  if (balanceIdx >= 0) detected.balance = headers[balanceIdx];

  const refPatterns = [
    'arhiveerimistunnus',
    'viitenumber',
    'reference',
    'ref',
    'viide',
    'مرجع',
    'transaction id',
    'trans id',
    'id',
    'doc',
    'dok nr',
    'buchungsnummer',
  ];
  const refIdx = findColumn(refPatterns);
  if (refIdx >= 0) detected.reference = headers[refIdx];

  const dirPatterns = [
    'deebet/kreedit (d/c)',
    'deebet/kreedit',
    'd/c',
    'direction',
    'type',
    'suund',
    'soll/haben',
  ];
  const dirIdx = findColumn(dirPatterns);
  if (dirIdx >= 0) detected.direction = headers[dirIdx];

  const currencyPatterns = [
    'valuuta tähis',
    'source currency',
    'target currency',
    'currency',
    'ccy',
    'währung',
    'valuta',
  ];
  const currencyIdx = findColumn(currencyPatterns);
  if (currencyIdx >= 0) detected.currency = headers[currencyIdx];

  const feePatterns = [
    'teenustasu',
    'source fee amount',
    'target fee amount',
    'fee',
    'fees',
    'charge',
    'commission',
    'gebühr',
    'tasu',
  ];
  const feeIdx = findColumn(feePatterns);
  if (feeIdx >= 0) detected.fee = headers[feeIdx];

  const categoryPatterns = ['category', 'kategooria', 'kategorie', 'type', 'expense type'];
  const categoryIdx = findColumn(categoryPatterns);
  if (categoryIdx >= 0) detected.category = headers[categoryIdx];

  const statusPatterns = ['status', 'state', 'olek', 'zustand'];
  const statusIdx = findColumn(statusPatterns);
  if (statusIdx >= 0) detected.status = headers[statusIdx];

  return detected;
}

function detectByDataPatterns(headers: string[], csvRows: ParsedRow[]): Partial<ColumnMapping> {
  const detected: Partial<ColumnMapping> = {};
  const sampleValues = csvRows.slice(0, 10);

  headers.forEach((header) => {
    const values = sampleValues.map((row) => row[header] || '').filter((v) => v);
    if (values.length === 0) return;

    const datePattern = /^(\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{4}[-./]\d{1,2}[-./]\d{1,2})/;
    const dateMatches = values.filter((v) => datePattern.test(v)).length;
    if (dateMatches >= values.length * 0.8 && !detected.date) {
      detected.date = header;
      return;
    }

    const amountPattern = /^-?[\d\s.,]+$/;
    const hasDecimal = values.some((v) => /[.,]\d{2}$/.test(v));
    const amountMatches = values.filter((v) => amountPattern.test(v) && v.length > 1).length;
    if (amountMatches >= values.length * 0.8 && hasDecimal && !detected.amount) {
      detected.amount = header;
      return;
    }

    const dirPattern = /^(D|C|IN|OUT|DEBIT|CREDIT)$/i;
    const dirMatches = values.filter((v) => dirPattern.test(v.trim())).length;
    if (dirMatches >= values.length * 0.8 && !detected.direction) {
      detected.direction = header;
      return;
    }

    const currPattern = /^[A-Z]{3}$/;
    const currMatches = values.filter((v) => currPattern.test(v.trim())).length;
    if (currMatches >= values.length * 0.8 && !detected.currency) {
      detected.currency = header;
      return;
    }

    const ibanPattern = /^[A-Z]{2}\d{2}/;
    const ibanMatches = values.filter((v) => ibanPattern.test(v)).length;
    if (ibanMatches >= values.length * 0.5 && !detected.counterpartyAccount) {
      detected.counterpartyAccount = header;
      return;
    }

    const statusPattern = /^(COMPLETED|REFUNDED|PENDING|CANCELLED|FAILED)$/i;
    const statusMatches = values.filter((v) => statusPattern.test(v.trim())).length;
    if (statusMatches >= values.length * 0.5 && !detected.status) {
      detected.status = header;
      return;
    }
  });

  const mappedHeaders = new Set(Object.values(detected).filter(Boolean));
  let bestDescHeader = '';
  let bestAvgLen = 0;

  headers.forEach((header) => {
    if (mappedHeaders.has(header)) return;
    const values = sampleValues.map((row) => row[header] || '').filter((v) => v);
    const avgLen = values.reduce((sum, v) => sum + v.length, 0) / (values.length || 1);
    const hasSpaces = values.some((v) => v.includes(' '));
    if (avgLen > bestAvgLen && avgLen > 10 && hasSpaces) {
      bestAvgLen = avgLen;
      bestDescHeader = header;
    }
  });
  if (bestDescHeader && !detected.description) {
    detected.description = bestDescHeader;
  }

  if (!detected.counterpartyName) {
    headers.forEach((header) => {
      if (mappedHeaders.has(header) || header === detected.description) return;
      const values = sampleValues.map((row) => row[header] || '').filter((v) => v);
      const namePattern = /^[A-Za-z].*[a-z]/;
      const nameMatches = values.filter(
        (v) => namePattern.test(v) && v.length > 3 && v.length < 100
      ).length;
      if (nameMatches >= values.length * 0.5 && !detected.counterpartyName) {
        detected.counterpartyName = header;
      }
    });
  }

  return detected;
}

async function predictCategories(
  transactions: ParsedTransaction[],
  categories: Array<{ id: string; name: string }>,
  locale: string,
  currency: string,
  wsId: string
): Promise<
  Map<string, { categoryId: string | null; categoryName: string | null; confidence: number }>
> {
  const categorizer = new HeuristicCategorizer();
  const results = new Map<
    string,
    { categoryId: string | null; categoryName: string | null; confidence: number }
  >();

  for (const tx of transactions) {
    try {
      const bankTx = {
        id: tx.id,
        descriptionRaw: tx.description || '',
        amount: {
          amount: Math.round(tx.amount * 100),
          currency,
        },
        counterparty: tx.counterpartyName,
        reference: tx.reference,
        postedAt: tx.date,
      };

      const proposal = await categorizer.categorizeTransaction(
        bankTx as Parameters<typeof categorizer.categorizeTransaction>[0],
        categories as Parameters<typeof categorizer.categorizeTransaction>[1],
        {
          workspaceId: wsId,
          locale,
          baseCurrency: currency,
          merchantNames: [],
        } as Parameters<typeof categorizer.categorizeTransaction>[2]
      );

      results.set(tx.id, {
        categoryId: proposal.data.categoryId,
        categoryName: proposal.data.categoryName,
        confidence: proposal.confidence,
      });
    } catch (error) {
      console.error('[CSV Analyze] Category prediction failed:', error);
      results.set(tx.id, { categoryId: null, categoryName: null, confidence: 0 });
    }
  }

  return results;
}
