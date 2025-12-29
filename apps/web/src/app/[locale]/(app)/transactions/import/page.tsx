'use client';

import { cn } from '@moneio/ui';
import {
  Upload,
  FileText,
  ArrowLeft,
  ArrowRight,
  Check,
  AlertCircle,
  Loader2,
  Table2,
  Settings2,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useRef } from 'react';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  balance?: string;
  reference?: string;
  direction?: string; // D/C or IN/OUT indicator
}

interface PreviewTransaction {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
}

const REQUIRED_COLUMNS = ['date', 'description', 'amount'] as const;
const OPTIONAL_COLUMNS = ['balance', 'reference'] as const;

const STEP_CONFIG = {
  upload: { icon: Upload, title: 'Upload CSV' },
  mapping: { icon: Settings2, title: 'Map Columns' },
  preview: { icon: Table2, title: 'Preview' },
  importing: { icon: Loader2, title: 'Importing' },
  complete: { icon: CheckCircle2, title: 'Complete' },
};

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
  const [preview, setPreview] = useState<PreviewTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [_importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(
    null
  );
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    imported: number;
    skipped: number;
    startTime: number;
  } | null>(null);

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    // Detect delimiter
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

  /**
   * Normalize headers using AI - translates any language to standard column names
   */
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
          sampleRows: sampleRows.slice(0, 3).map((row) => csvHeaders.map((h) => row[h] || '')),
        }),
      });

      if (!response.ok) return null;

      const result = await response.json();
      if (!result.mappings || result.mappings.length === 0) return null;

      // Convert AI mappings to ColumnMapping format
      const detected: Partial<ColumnMapping> = {};
      for (const m of result.mappings) {
        if (m.normalized && m.confidence > 0.5) {
          // Map normalized type to our ColumnMapping keys
          if (m.normalized === 'date') detected.date = m.original;
          else if (m.normalized === 'description') detected.description = m.original;
          else if (m.normalized === 'amount') detected.amount = m.original;
          else if (m.normalized === 'balance') detected.balance = m.original;
          else if (m.normalized === 'reference') detected.reference = m.original;
          else if (m.normalized === 'direction') detected.direction = m.original;
        }
      }

      // Return only if we found all required fields
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

    // Helper to find first matching column
    const findColumn = (patterns: string[]): number => {
      // First try exact matches
      for (const pattern of patterns) {
        const idx = normalized.findIndex((h) => h === pattern);
        if (idx >= 0) return idx;
      }
      // Then try partial matches
      for (const pattern of patterns) {
        const idx = normalized.findIndex((h) => h.includes(pattern));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    // Date patterns - support various bank formats
    const datePatterns = [
      // Exact matches first
      'makse kuupäev', // Swedbank Estonia
      'created on', // Wise
      'finished on', // Wise
      'booking date', // Common
      'value date', // Common
      'transaction date', // Common
      'posted', // Common
      // Partial matches
      'date',
      'datum',
      'kuupäev',
      'تاريخ',
      'päev',
    ];
    const dateIdx = findColumn(datePatterns);
    if (dateIdx >= 0) detected.date = csvHeaders[dateIdx];

    // Description patterns - merchant/payee info
    const descPatterns = [
      // Exact matches first
      'selgitus', // Swedbank Estonia (explanation)
      'target name', // Wise
      'saaja/maksja nimi', // Swedbank (recipient/payer name)
      'merchant', // Common
      'payee', // Common
      'narrative', // Common
      // Partial matches
      'description',
      'memo',
      'kirjeldus',
      'توضیحات',
      'details',
      'text',
      'nimi', // Estonian: name
    ];
    const descIdx = findColumn(descPatterns);
    if (descIdx >= 0) detected.description = csvHeaders[descIdx];

    // Amount patterns - handle various formats
    const amountPatterns = [
      // Exact matches first
      'summa', // Swedbank Estonia
      'source amount (after fees)', // Wise
      'target amount (after fees)', // Wise
      'amount', // Common
      // Partial matches
      'مبلغ',
      'value',
      'debit',
      'credit',
      'sum',
      'betrag', // German
    ];
    const amountIdx = findColumn(amountPatterns);
    if (amountIdx >= 0) detected.amount = csvHeaders[amountIdx];

    // Balance patterns
    const balancePatterns = [
      'balance',
      'saldo',
      'موجودی',
      'running balance',
      'jääk', // Estonian
    ];
    const balanceIdx = findColumn(balancePatterns);
    if (balanceIdx >= 0) detected.balance = csvHeaders[balanceIdx];

    // Reference patterns - transaction identifiers
    const refPatterns = [
      // Exact matches first
      'arhiveerimistunnus', // Swedbank Estonia (archive ID)
      'viitenumber', // Swedbank Estonia (reference number)
      'id', // Wise
      'reference', // Common
      // Partial matches
      'ref',
      'viide',
      'مرجع',
      'transaction id',
      'doc',
      'dok',
    ];
    const refIdx = findColumn(refPatterns);
    if (refIdx >= 0) detected.reference = csvHeaders[refIdx];

    // Direction patterns - D/C or IN/OUT for sign
    const dirPatterns = [
      'deebet/kreedit (d/c)', // Swedbank Estonia
      'deebet/kreedit', // Swedbank Estonia variant
      'd/c', // Common
      'direction', // Wise
      'type', // Common
      'suund', // Estonian
    ];
    const dirIdx = findColumn(dirPatterns);
    if (dirIdx >= 0) detected.direction = csvHeaders[dirIdx];

    return detected;
  };

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);

    try {
      const text = await selectedFile.text();
      const { headers: csvHeaders, rows: csvRows } = parseCSV(text);

      setHeaders(csvHeaders);
      setRows(csvRows);

      // Try AI normalization first, then fall back to pattern matching
      setIsNormalizing(true);
      let detected = await normalizeHeadersWithAI(csvHeaders, csvRows);

      if (!detected) {
        // Fall back to pattern-based detection
        detected = autoDetectMapping(csvHeaders);
      }

      setMapping(detected);
      setIsNormalizing(false);
      setStep('mapping');
    } catch (err) {
      setIsNormalizing(false);
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
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
    setMapping((prev) => ({
      ...prev,
      [field]: value || undefined,
    }));
  };

  const parseAmount = (value: string, direction?: string): number => {
    // Handle different number formats
    let cleaned = value.replace(/[^\d.,-]/g, '');

    // Check if the value itself indicates negative (starts with -)
    const hasNegativeSign = value.trim().startsWith('-');

    // Remove negative sign for parsing
    cleaned = cleaned.replace(/^-/, '');

    // Handle European format (1.234,56)
    if (
      cleaned.includes(',') &&
      cleaned.includes('.') &&
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
    ) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      // Handle comma as decimal separator
      cleaned = cleaned.replace(',', '.');
    }

    let amount = parseFloat(cleaned) || 0;

    // Apply sign from direction column if present
    if (direction) {
      const dir = direction.toUpperCase().trim();
      // D = Debit = money out = negative
      // C = Credit = money in = positive
      // OUT = money out = negative
      // IN = money in = positive
      if (dir === 'D' || dir === 'OUT' || dir === 'DEBIT') {
        amount = -Math.abs(amount);
      } else if (dir === 'C' || dir === 'IN' || dir === 'CREDIT') {
        amount = Math.abs(amount);
      }
    } else if (hasNegativeSign) {
      // Use original negative sign
      amount = -Math.abs(amount);
    }

    return amount;
  };

  const parseDate = (value: string): string => {
    // Try to parse various date formats and return YYYY-MM-DD
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    // Try DD/MM/YYYY or DD.MM.YYYY
    const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return value; // Return as-is if can't parse
  };

  const generatePreview = () => {
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setError('Please map all required columns');
      return;
    }

    const previewData: PreviewTransaction[] = rows.slice(0, 10).map((row) => ({
      date: parseDate(row[mapping.date!]),
      description: row[mapping.description!] || '(no description)',
      amount: parseAmount(
        row[mapping.amount!],
        mapping.direction ? row[mapping.direction] : undefined
      ),
      balance: mapping.balance ? parseAmount(row[mapping.balance]) : undefined,
      reference: mapping.reference ? row[mapping.reference] : undefined,
    }));

    setPreview(previewData);
    setStep('preview');
  };

  const handleImport = async () => {
    if (!workspaceId) return;

    setImporting(true);
    setStep('importing');

    const transactions = rows.map((row) => ({
      date: parseDate(row[mapping.date!]),
      description: row[mapping.description!] || '(no description)',
      amount: parseAmount(
        row[mapping.amount!],
        mapping.direction ? row[mapping.direction] : undefined
      ),
      balance: mapping.balance ? parseAmount(row[mapping.balance]) : undefined,
      reference: mapping.reference ? row[mapping.reference] : undefined,
    }));

    // Import in batches for progress tracking
    const BATCH_SIZE = 50;
    const batches: typeof transactions[] = [];
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      batches.push(transactions.slice(i, i + BATCH_SIZE));
    }

    setImportProgress({
      current: 0,
      total: transactions.length,
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
                current: Math.min((i + 1) * BATCH_SIZE, transactions.length),
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
      setImporting(false);
      setImportProgress(null);
    }
  };

  const isMappingValid = mapping.date && mapping.description && mapping.amount;

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {(['upload', 'mapping', 'preview', 'complete'] as const).map((s, i) => {
        const config = STEP_CONFIG[s];
        const Icon = config.icon;
        const isActive = step === s || (step === 'importing' && s === 'complete');
        const isComplete =
          (s === 'upload' && step !== 'upload') ||
          (s === 'mapping' && ['preview', 'importing', 'complete'].includes(step)) ||
          (s === 'preview' && ['importing', 'complete'].includes(step));

        return (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isComplete
                    ? 'border-success bg-success text-success-foreground'
                    : 'border-border bg-background text-muted-foreground'
              )}
            >
              {isComplete ? (
                <Check className="h-5 w-5" />
              ) : (
                <Icon
                  className={cn(
                    'h-5 w-5',
                    step === 'importing' && s === 'complete' && 'animate-spin'
                  )}
                />
              )}
            </div>
            {i < 3 && (
              <div
                className={cn(
                  'h-0.5 w-8 transition-colors',
                  isComplete ? 'bg-success' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderUploadStep = () => (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => !isNormalizing && fileInputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-12 transition-colors',
        isNormalizing ? 'cursor-wait' : 'hover:border-primary/50 hover:bg-accent/50'
      )}
    >
      {isNormalizing ? (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg font-medium text-foreground">Analyzing columns...</p>
          <p className="mt-2 text-sm text-muted-foreground">Using AI to detect column types</p>
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
        disabled={isNormalizing}
      />
    </div>
  );

  const renderMappingStep = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium">{file?.name}</span>
        <span className="text-sm text-muted-foreground">({rows.length} rows)</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((field) => (
          <div key={field} className="space-y-2">
            <label className="flex items-center gap-1 text-sm font-medium">
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {REQUIRED_COLUMNS.includes(field as (typeof REQUIRED_COLUMNS)[number]) && (
                <span className="text-destructive">*</span>
              )}
            </label>
            <select
              value={mapping[field as keyof ColumnMapping] || ''}
              onChange={(e) => handleMappingChange(field as keyof ColumnMapping, e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select column...</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Sample data preview */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-medium">Sample Data (first 3 rows)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="px-4 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {headers.map((header) => (
                      <td key={header} className="px-4 py-2 truncate max-w-[200px]">
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

      <div className="flex justify-between">
        <button
          onClick={() => {
            setStep('upload');
            setFile(null);
            setHeaders([]);
            setRows([]);
            setMapping({});
          }}
          className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </button>
        <button
          onClick={generatePreview}
          disabled={!isMappingValid}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {tCommon('next')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Importing {rows.length} transactions from {file?.name}
        </p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted px-4 py-2 text-sm font-medium">Preview (first 10 rows)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                {mapping.balance && <th className="px-4 py-2 text-right font-medium">Balance</th>}
                {mapping.reference && (
                  <th className="px-4 py-2 text-left font-medium">Reference</th>
                )}
              </tr>
            </thead>
            <tbody>
              {preview.map((tx, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{tx.date}</td>
                  <td className="px-4 py-2 truncate max-w-[300px]">{tx.description}</td>
                  <td
                    className={cn(
                      'px-4 py-2 text-right font-tabular-nums',
                      tx.amount >= 0 ? 'text-success' : 'text-destructive'
                    )}
                  >
                    {tx.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  {mapping.balance && (
                    <td className="px-4 py-2 text-right font-tabular-nums">
                      {tx.balance?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  )}
                  {mapping.reference && <td className="px-4 py-2">{tx.reference}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep('mapping')}
          className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </button>
        <button
          onClick={handleImport}
          className="flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-medium text-success-foreground hover:bg-success/90"
        >
          <Check className="h-4 w-4" />
          {tCommon('import')} {rows.length} transactions
        </button>
      </div>
    </div>
  );

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const renderImportingStep = () => {
    const progress = importProgress;
    const percentage = progress ? Math.round((progress.current / progress.total) * 100) : 0;
    const elapsedSeconds = progress ? (Date.now() - progress.startTime) / 1000 : 0;

    // Estimate remaining time based on progress
    const estimatedTotalSeconds =
      progress && progress.current > 0 ? (elapsedSeconds / progress.current) * progress.total : 0;
    const estimatedRemainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds);

    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Importing transactions...</p>

        {progress && (
          <div className="mt-6 w-full max-w-md space-y-3">
            {/* Progress bar */}
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* Progress stats */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {progress.current} / {progress.total} transactions
              </span>
              <span>{percentage}%</span>
            </div>

            {/* Time info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Elapsed: {formatTime(elapsedSeconds)}</span>
              {progress.current > 0 && (
                <span>Est. remaining: {formatTime(estimatedRemainingSeconds)}</span>
              )}
            </div>

            {/* Import stats */}
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
            setPreview([]);
            setImportResult(null);
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

      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="rounded-lg border border-border bg-card p-6">
        {step === 'upload' && renderUploadStep()}
        {step === 'mapping' && renderMappingStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'importing' && renderImportingStep()}
        {step === 'complete' && renderCompleteStep()}
      </div>
    </div>
  );
}
