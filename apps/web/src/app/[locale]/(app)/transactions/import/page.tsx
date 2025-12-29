'use client';

import { cn } from '@moneio/ui';
import {
  Upload,
  FileText,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Trash2,
  Settings2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useRef } from 'react';

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  balance?: string;
  reference?: string;
  direction?: string;
  currency?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  fee?: string;
  category?: string;
  status?: string;
}

interface PreviewTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
  currency?: string;
  counterpartyName?: string;
  fee?: number;
  category?: string;
  status?: string;
  originalRow: ParsedRow;
}

const REQUIRED_COLUMNS = ['date', 'description', 'amount'] as const;
const OPTIONAL_COLUMNS = ['balance', 'reference'] as const;

export default function CsvImportPage() {
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [transactions, setTransactions] = useState<PreviewTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(
    null
  );
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    imported: number;
    skipped: number;
    startTime: number;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const csvHeaders = parseLine(lines[0]);
    const csvRows = lines.slice(1).map((line) => {
      const values = parseLine(line);
      const row: ParsedRow = {};
      csvHeaders.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });

    return { headers: csvHeaders, rows: csvRows };
  };

  const normalizeHeadersWithAI = async (
    csvHeaders: string[],
    sampleRows: ParsedRow[]
  ): Promise<Partial<ColumnMapping> | null> => {
    try {
      const response = await fetch('/api/transactions/normalize-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: csvHeaders,
          sampleRows: sampleRows.slice(0, 5).map((row) => csvHeaders.map((h) => row[h] || '')),
        }),
      });

      if (!response.ok) return null;

      const result = await response.json();
      if (!result.mappings || result.mappings.length === 0) return null;

      const detected: Partial<ColumnMapping> = {};
      for (const m of result.mappings) {
        if (m.normalized && m.confidence > 0.5) {
          if (m.normalized === 'date') detected.date = m.original;
          else if (m.normalized === 'description') detected.description = m.original;
          else if (m.normalized === 'amount') detected.amount = m.original;
          else if (m.normalized === 'balance') detected.balance = m.original;
          else if (m.normalized === 'reference') detected.reference = m.original;
          else if (m.normalized === 'direction') detected.direction = m.original;
          else if (m.normalized === 'currency') detected.currency = m.original;
          else if (m.normalized === 'counterpartyName') detected.counterpartyName = m.original;
          else if (m.normalized === 'counterpartyAccount')
            detected.counterpartyAccount = m.original;
          else if (m.normalized === 'fee') detected.fee = m.original;
          else if (m.normalized === 'category') detected.category = m.original;
          else if (m.normalized === 'status') detected.status = m.original;
        }
      }

      // If no description but we have counterparty name, use that
      if (!detected.description && detected.counterpartyName) {
        detected.description = detected.counterpartyName;
      }

      if (detected.date && detected.description && detected.amount) {
        return detected;
      }
      return null;
    } catch {
      return null;
    }
  };

  const autoDetectMapping = (csvHeaders: string[]): Partial<ColumnMapping> => {
    const normalized = csvHeaders.map((h) => h.toLowerCase().trim());
    const detected: Partial<ColumnMapping> = {};

    const findColumn = (patterns: string[]): number => {
      // Exact match first
      for (const pattern of patterns) {
        const idx = normalized.findIndex((h) => h === pattern);
        if (idx >= 0) return idx;
      }
      // Partial match second
      for (const pattern of patterns) {
        const idx = normalized.findIndex((h) => h.includes(pattern));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    // Date patterns - common across banks
    const datePatterns = [
      'makse kuupäev', // Estonian: Payment date
      'created on', // Wise
      'finished on', // Wise
      'booking date',
      'value date',
      'transaction date',
      'posted date',
      'posted at',
      'posted',
      'date',
      'datum', // German
      'kuupäev', // Estonian
      'تاريخ', // Persian
      'päev', // Estonian: day
      'buchungstag', // German: booking day
      'wertstellung', // German: value date
    ];
    const dateIdx = findColumn(datePatterns);
    if (dateIdx >= 0) detected.date = csvHeaders[dateIdx];

    // Description patterns - transaction narrative/details
    const descPatterns = [
      'selgitus', // Estonian: explanation
      'description',
      'narrative',
      'memo',
      'details',
      'text',
      'kirjeldus', // Estonian
      'توضیحات', // Persian
      'verwendungszweck', // German: purpose
      'buchungstext', // German: booking text
      'transaction details',
      'payment details',
      'particulars',
    ];
    const descIdx = findColumn(descPatterns);
    if (descIdx >= 0) detected.description = csvHeaders[descIdx];

    // Counterparty name patterns - payee/merchant/sender name
    const counterpartyPatterns = [
      'saaja/maksja nimi', // Estonian: payee/payer name
      'target name', // Wise
      'source name', // Wise (for incoming)
      'merchant',
      'payee',
      'payer',
      'beneficiary',
      'counterparty',
      'vendor',
      'sender',
      'recipient',
      'nimi', // Estonian: name
      'empfänger', // German: recipient
      'auftraggeber', // German: client/sender
      'begunstigde', // Dutch: beneficiary
    ];
    const counterpartyIdx = findColumn(counterpartyPatterns);
    if (counterpartyIdx >= 0) detected.counterpartyName = csvHeaders[counterpartyIdx];

    // If no description found, use counterparty name as description
    if (!detected.description && detected.counterpartyName) {
      detected.description = detected.counterpartyName;
    }

    // Counterparty account (IBAN) patterns
    const counterpartyAccountPatterns = [
      'saaja/maksja konto', // Estonian: payee/payer account
      'beneficiary account',
      'counterparty account',
      'payee account',
      'iban',
      'account number',
      'konto', // Estonian/German: account
    ];
    const counterpartyAccountIdx = findColumn(counterpartyAccountPatterns);
    if (counterpartyAccountIdx >= 0)
      detected.counterpartyAccount = csvHeaders[counterpartyAccountIdx];

    // Amount patterns
    const amountPatterns = [
      'summa', // Estonian: sum/amount
      'source amount (after fees)', // Wise
      'target amount (after fees)', // Wise
      'source amount',
      'target amount',
      'amount',
      'مبلغ', // Persian
      'value',
      'sum',
      'betrag', // German
      'bedrag', // Dutch
      'debit',
      'credit',
    ];
    const amountIdx = findColumn(amountPatterns);
    if (amountIdx >= 0) detected.amount = csvHeaders[amountIdx];

    // Balance patterns
    const balancePatterns = [
      'balance',
      'saldo', // German/Estonian
      'موجودی', // Persian
      'running balance',
      'jääk', // Estonian: remainder
      'kontostand', // German: account balance
    ];
    const balanceIdx = findColumn(balancePatterns);
    if (balanceIdx >= 0) detected.balance = csvHeaders[balanceIdx];

    // Reference/ID patterns
    const refPatterns = [
      'arhiveerimistunnus', // Estonian: archive ID
      'viitenumber', // Estonian: reference number
      'reference',
      'ref',
      'viide', // Estonian: reference
      'مرجع', // Persian
      'transaction id',
      'trans id',
      'id',
      'doc',
      'dok nr', // Estonian: document number
      'buchungsnummer', // German: booking number
    ];
    const refIdx = findColumn(refPatterns);
    if (refIdx >= 0) detected.reference = csvHeaders[refIdx];

    // Direction patterns (debit/credit indicator)
    const dirPatterns = [
      'deebet/kreedit (d/c)', // Estonian
      'deebet/kreedit',
      'd/c',
      'direction', // Wise: IN/OUT
      'type',
      'suund', // Estonian: direction
      'soll/haben', // German: debit/credit
    ];
    const dirIdx = findColumn(dirPatterns);
    if (dirIdx >= 0) detected.direction = csvHeaders[dirIdx];

    // Currency patterns
    const currencyPatterns = [
      'valuuta tähis', // Estonian: currency code
      'source currency', // Wise
      'target currency', // Wise
      'currency',
      'ccy',
      'währung', // German
      'valuta', // Estonian
    ];
    const currencyIdx = findColumn(currencyPatterns);
    if (currencyIdx >= 0) detected.currency = csvHeaders[currencyIdx];

    // Fee patterns
    const feePatterns = [
      'teenustasu', // Estonian: service fee
      'source fee amount', // Wise
      'target fee amount',
      'fee',
      'fees',
      'charge',
      'commission',
      'gebühr', // German
      'tasu', // Estonian: fee
    ];
    const feeIdx = findColumn(feePatterns);
    if (feeIdx >= 0) detected.fee = csvHeaders[feeIdx];

    // Category patterns (Wise has built-in categories)
    const categoryPatterns = [
      'category',
      'kategooria', // Estonian
      'kategorie', // German
      'type',
      'expense type',
    ];
    const categoryIdx = findColumn(categoryPatterns);
    if (categoryIdx >= 0) detected.category = csvHeaders[categoryIdx];

    // Status patterns (for filtering completed vs refunded)
    const statusPatterns = [
      'status',
      'state',
      'olek', // Estonian
      'zustand', // German
    ];
    const statusIdx = findColumn(statusPatterns);
    if (statusIdx >= 0) detected.status = csvHeaders[statusIdx];

    return detected;
  };

  const parseAmount = (value: string, direction?: string): number => {
    let cleaned = value.replace(/[^\d.,-]/g, '');
    const hasNegativeSign = value.trim().startsWith('-');
    cleaned = cleaned.replace(/^-/, '');

    if (
      cleaned.includes(',') &&
      cleaned.includes('.') &&
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
    ) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      cleaned = cleaned.replace(',', '.');
    }

    let amount = parseFloat(cleaned) || 0;

    if (direction) {
      const dir = direction.toUpperCase().trim();
      if (dir === 'D' || dir === 'OUT' || dir === 'DEBIT') {
        amount = -Math.abs(amount);
      } else if (dir === 'C' || dir === 'IN' || dir === 'CREDIT') {
        amount = Math.abs(amount);
      }
    } else if (hasNegativeSign) {
      amount = -Math.abs(amount);
    }

    return amount;
  };

  const parseDate = (value: string): string => {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return value;
  };

  const generateTransactions = (
    csvRows: ParsedRow[],
    columnMapping: Partial<ColumnMapping>
  ): PreviewTransaction[] => {
    if (!columnMapping.date || !columnMapping.description || !columnMapping.amount) {
      return [];
    }

    return csvRows
      .map((row, index) => {
        // Get status if available
        const status = columnMapping.status ? row[columnMapping.status]?.toUpperCase() : undefined;

        // Skip refunded/cancelled transactions
        if (status === 'REFUNDED' || status === 'CANCELLED' || status === 'FAILED') {
          return null;
        }

        // Build description from multiple sources for better context
        let description = row[columnMapping.description!] || '';

        // For Wise: if description is empty but we have counterparty, use that
        if (!description && columnMapping.counterpartyName) {
          description = row[columnMapping.counterpartyName] || '';
        }

        // If still empty, try to build from counterparty name
        if (!description) {
          description = '(no description)';
        }

        // Get currency - prefer source currency for Wise
        let currency = columnMapping.currency ? row[columnMapping.currency] : undefined;
        if (!currency) {
          // Default based on common patterns
          currency = 'EUR';
        }

        return {
          id: `row-${index}`,
          date: parseDate(row[columnMapping.date!]),
          description,
          amount: parseAmount(
            row[columnMapping.amount!],
            columnMapping.direction ? row[columnMapping.direction] : undefined
          ),
          balance: columnMapping.balance ? parseAmount(row[columnMapping.balance]) : undefined,
          reference: columnMapping.reference ? row[columnMapping.reference] : undefined,
          currency,
          counterpartyName: columnMapping.counterpartyName
            ? row[columnMapping.counterpartyName]
            : undefined,
          fee: columnMapping.fee ? parseAmount(row[columnMapping.fee]) : undefined,
          category: columnMapping.category ? row[columnMapping.category] : undefined,
          status,
          originalRow: row,
        };
      })
      .filter((tx): tx is NonNullable<typeof tx> => tx !== null);
  };

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    setIsAnalyzing(true);

    try {
      const text = await selectedFile.text();
      const { headers: csvHeaders, rows: csvRows } = parseCSV(text);

      setHeaders(csvHeaders);
      setRows(csvRows);

      // Try AI normalization first
      let detected = await normalizeHeadersWithAI(csvHeaders, csvRows);

      if (!detected) {
        detected = autoDetectMapping(csvHeaders);
      }

      setMapping(detected);

      // If we have all required fields, generate preview and go straight to preview
      if (detected.date && detected.description && detected.amount) {
        const txns = generateTransactions(csvRows, detected);
        setTransactions(txns);
        setStep('preview');
      } else {
        // Show mapping editor if we couldn't detect all fields
        setShowMappingEditor(true);
        setStep('preview');
        setTransactions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv'))) {
        handleFileSelect(droppedFile);
      } else {
        setError('Please drop a CSV file');
      }
    },
    [handleFileSelect]
  );

  const handleMappingChange = (field: keyof ColumnMapping, value: string) => {
    const newMapping = { ...mapping, [field]: value || undefined };
    setMapping(newMapping);

    // Regenerate transactions with new mapping
    if (newMapping.date && newMapping.description && newMapping.amount) {
      const txns = generateTransactions(rows, newMapping);
      setTransactions(txns);
    }
  };

  const handleRemoveTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const handleRemoveSelected = () => {
    if (selectedIds.size === 0) return;
    setTransactions((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
  };

  const handleRemoveAll = () => {
    setTransactions([]);
    setSelectedIds(new Set());
  };

  const handleImport = async () => {
    if (!workspaceId || transactions.length === 0) return;

    setStep('importing');

    const toImport = transactions.map((tx) => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      balance: tx.balance,
      reference: tx.reference,
    }));

    const BATCH_SIZE = 500;
    const batches: (typeof toImport)[] = [];
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      batches.push(toImport.slice(i, i + BATCH_SIZE));
    }

    setImportProgress({
      current: 0,
      total: toImport.length,
      imported: 0,
      skipped: 0,
      startTime: Date.now(),
    });

    let totalImported = 0;
    let totalSkipped = 0;

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        const response = await fetch('/api/transactions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            transactions: batch,
            fileName: file?.name,
          }),
        });

        if (!response.ok) {
          throw new Error('Import failed');
        }

        const result = await response.json();
        totalImported += result.imported;
        totalSkipped += result.skipped;

        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                current: Math.min((i + 1) * BATCH_SIZE, toImport.length),
                imported: totalImported,
                skipped: totalSkipped,
              }
            : null
        );
      }

      setImportResult({ imported: totalImported, skipped: totalSkipped });
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    } finally {
      setImportProgress(null);
    }
  };

  const isMappingValid = mapping.date && mapping.description && mapping.amount;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const renderUploadStep = () => (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !isAnalyzing && fileInputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-12 transition-colors',
        isAnalyzing ? 'cursor-wait' : 'hover:border-primary/50 hover:bg-accent/50'
      )}
    >
      {isAnalyzing ? (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg font-medium text-foreground">Analyzing CSV...</p>
          <p className="mt-2 text-sm text-muted-foreground">Detecting columns automatically</p>
        </>
      ) : (
        <>
          <Upload className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium text-foreground">Drop CSV file here</p>
          <p className="mt-2 text-sm text-muted-foreground">or click to browse</p>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        className="hidden"
        disabled={isAnalyzing}
      />
    </div>
  );

  const renderMappingEditor = () => (
    <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Column Mapping
        </h3>
        <button onClick={() => setShowMappingEditor(false)} className="rounded p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((field) => (
          <div key={field} className="space-y-1">
            <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {REQUIRED_COLUMNS.includes(field as (typeof REQUIRED_COLUMNS)[number]) && (
                <span className="text-destructive">*</span>
              )}
            </label>
            <select
              value={mapping[field as keyof ColumnMapping] || ''}
              onChange={(e) => handleMappingChange(field as keyof ColumnMapping, e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Sample data */}
      {rows.length > 0 && (
        <div className="mt-4 rounded border border-border overflow-hidden">
          <div className="bg-muted px-3 py-1.5 text-xs font-medium">Raw CSV (first 3 rows)</div>
          <div className="overflow-x-auto max-h-32">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {headers.map((header) => (
                      <td key={header} className="px-2 py-1 truncate max-w-[150px]">
                        {row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      {/* File info & controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">{file?.name}</span>
          <span className="text-sm text-muted-foreground">
            ({transactions.length} transactions)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!showMappingEditor && (
            <button
              onClick={() => setShowMappingEditor(true)}
              className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Settings2 className="h-4 w-4" />
              Edit Mapping
            </button>
          )}
          <button
            onClick={() => {
              setStep('upload');
              setFile(null);
              setHeaders([]);
              setRows([]);
              setMapping({});
              setTransactions([]);
              setShowMappingEditor(false);
              setSelectedIds(new Set());
            }}
            className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </div>

      {/* Mapping editor (collapsible) */}
      {showMappingEditor && renderMappingEditor()}

      {/* Transactions table */}
      {!isMappingValid ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Column mapping incomplete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Please map Date, Description, and Amount columns
          </p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">No transactions to import</p>
        </div>
      ) : (
        <>
          {/* Bulk actions bar */}
          <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size > 0 ? (
                  <span className="font-medium text-foreground">
                    {selectedIds.size} of {transactions.length} selected
                  </span>
                ) : (
                  <span>{transactions.length} transactions</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleRemoveSelected}
                  className="flex items-center gap-1.5 rounded border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Selected ({selectedIds.size})
                </button>
              )}
              <button
                onClick={handleRemoveAll}
                className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove All
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 sticky top-0">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.size === transactions.length && transactions.length > 0
                        }
                        onChange={handleSelectAll}
                        className="h-4 w-4 rounded border-border"
                        title="Select all"
                      />
                    </th>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Description</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    {mapping.balance && (
                      <th className="px-4 py-2 text-right font-medium">Balance</th>
                    )}
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className={cn(
                        'border-b border-border last:border-0 hover:bg-muted/30',
                        selectedIds.has(tx.id) && 'bg-primary/5'
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tx.id)}
                          onChange={() => handleToggleSelect(tx.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{tx.date}</td>
                      <td className="px-4 py-2 max-w-[300px] truncate">{tx.description}</td>
                      <td
                        className={cn(
                          'px-4 py-2 text-right font-tabular-nums whitespace-nowrap',
                          tx.amount >= 0 ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {tx.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      {mapping.balance && (
                        <td className="px-4 py-2 text-right font-tabular-nums whitespace-nowrap">
                          {tx.balance?.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleRemoveTransaction(tx.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          <div className="flex justify-end">
            <button
              onClick={handleImport}
              disabled={transactions.length === 0}
              className="flex items-center gap-2 rounded-lg bg-success px-6 py-2.5 text-sm font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {tCommon('import')} {transactions.length} transactions
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderImportingStep = () => {
    const progress = importProgress;
    const percentage = progress ? Math.round((progress.current / progress.total) * 100) : 0;
    const elapsedSeconds = progress ? (Date.now() - progress.startTime) / 1000 : 0;
    const estimatedTotalSeconds =
      progress && progress.current > 0 ? (elapsedSeconds / progress.current) * progress.total : 0;
    const estimatedRemainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds);

    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Importing transactions...</p>

        {progress && (
          <div className="mt-6 w-full max-w-md space-y-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {progress.current} / {progress.total}
              </span>
              <span>{percentage}%</span>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Elapsed: {formatTime(elapsedSeconds)}</span>
              {progress.current > 0 && (
                <span>Remaining: ~{formatTime(estimatedRemainingSeconds)}</span>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 text-sm">
              <span className="text-success">{progress.imported} imported</span>
              {progress.skipped > 0 && (
                <span className="text-muted-foreground">{progress.skipped} skipped</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCompleteStep = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <p className="mt-4 text-lg font-medium">Import Complete!</p>
      {importResult && (
        <p className="mt-2 text-sm text-muted-foreground">
          {importResult.imported} transactions imported
          {importResult.skipped > 0 && `, ${importResult.skipped} duplicates skipped`}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => {
            setStep('upload');
            setFile(null);
            setHeaders([]);
            setRows([]);
            setMapping({});
            setTransactions([]);
            setImportResult(null);
            setShowMappingEditor(false);
            setSelectedIds(new Set());
          }}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          Import Another
        </button>
        <Link
          href={`/${locale}/transactions${workspaceId ? `?workspace=${workspaceId}` : ''}`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View Transactions
        </Link>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/transactions${workspaceId ? `?workspace=${workspaceId}` : ''}`}
          className="rounded-lg p-2 hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Import Bank Transactions</h1>
          <p className="text-sm text-muted-foreground">Upload a CSV file from your bank</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-sm underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="rounded-lg border border-border bg-card p-6">
        {step === 'upload' && renderUploadStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'importing' && renderImportingStep()}
        {step === 'complete' && renderCompleteStep()}
      </div>
    </div>
  );
}
