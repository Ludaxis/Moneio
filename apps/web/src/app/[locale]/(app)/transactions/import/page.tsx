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
  Sparkles,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useRef, useEffect } from 'react';

import { extractLocaleFromPath } from '@/lib/i18n';

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

interface WorkspaceCategory {
  id: string;
  name: string;
  type?: string;
}

interface ParsedRow {
  [key: string]: string;
}

interface ColumnMapping {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
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
  // AI-predicted category
  predictedCategoryId?: string;
  predictedCategoryName?: string;
  predictedConfidence?: number;
}

interface AnalyzeResponse {
  headers: string[];
  rows: ParsedRow[];
  mapping: Partial<ColumnMapping>;
  transactions: PreviewTransaction[];
  excluded: Array<{ index: number; reason: string; category?: string }>;
  stats?: { totalRows: number; included: number; excluded: number };
  fileName?: string;
}

const REQUIRED_COLUMNS = ['date', 'description'] as const;
const OPTIONAL_COLUMNS = [
  'amount',
  'debit',
  'credit',
  'balance',
  'reference',
  'direction',
  'currency',
  'counterpartyName',
  'counterpartyAccount',
  'fee',
  'category',
  'status',
] as const;

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  debit: 'Debit (split)',
  credit: 'Credit (split)',
  balance: 'Balance',
  reference: 'Reference',
  direction: 'Direction',
  currency: 'Currency',
  counterpartyName: 'Counterparty',
  counterpartyAccount: 'Counterparty Account',
  fee: 'Fee',
  category: 'Category',
  status: 'Status',
};

export default function CsvImportPage() {
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locale = extractLocaleFromPath(pathname);

  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [transactions, setTransactions] = useState<PreviewTransaction[]>([]);
  const [excludedRows, setExcludedRows] = useState<
    Array<{ index: number; reason: string; category?: string }>
  >([]);
  const [analysisStats, setAnalysisStats] = useState<{
    totalRows: number;
    included: number;
    excluded: number;
  } | null>(null);
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
  const [availableCategories, setAvailableCategories] = useState<WorkspaceCategory[]>([]);

  // Fetch available categories when workspace changes
  useEffect(() => {
    if (!workspaceId) return;

    const fetchCategories = async () => {
      try {
        const response = await fetch(`/api/categories?workspaceId=${workspaceId}&pageSize=100`);
        if (response.ok) {
          const data = await response.json();
          setAvailableCategories(data.categories || []);
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err);
      }
    };

    fetchCategories();
  }, [workspaceId]);

  // Handler to change a transaction's category
  const handleCategoryChange = (txId: string, categoryId: string) => {
    const category = availableCategories.find((c) => c.id === categoryId);
    if (!category) return;

    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              predictedCategoryId: categoryId,
              predictedCategoryName: category.name,
              predictedConfidence: 100, // User selected = 100% confidence
            }
          : tx
      )
    );
  };

  const runAnalysis = useCallback(
    async (text: string, overrides?: Partial<ColumnMapping>, analysisFileName?: string) => {
      if (!workspaceId) {
        setError('Workspace required to analyze CSV');
        return;
      }

      setIsAnalyzing(true);
      setError(null);

      try {
        const response = await fetch('/api/transactions/import/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            fileName: analysisFileName || file?.name,
            csvText: text,
            mappingOverrides: overrides,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(data.error || 'Failed to analyze CSV');
          return;
        }

        const data: AnalyzeResponse = await response.json();
        const resolvedMapping = data.mapping || {};
        const resolvedHasAmount =
          resolvedMapping.amount || resolvedMapping.debit || resolvedMapping.credit;

        setHeaders(data.headers || []);
        setRows(data.rows || []);
        setMapping(resolvedMapping);
        setTransactions(data.transactions || []);
        setExcludedRows(data.excluded || []);
        setAnalysisStats(data.stats || null);
        setStep('preview');
        setShowMappingEditor(
          !resolvedMapping.date || !resolvedMapping.description || !resolvedHasAmount
        );
        setSelectedIds(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyze CSV');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [workspaceId, file?.name]
  );

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setError(null);
      setFile(selectedFile);
      setImportResult(null);
      setImportProgress(null);
      const text = await selectedFile.text();
      setFileText(text);
      await runAnalysis(text, undefined, selectedFile.name);
    },
    [runAnalysis]
  );

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

    if (fileText) {
      const cleanedOverrides = Object.fromEntries(
        Object.entries(newMapping).filter(([, v]) => v)
      ) as Partial<ColumnMapping>;
      runAnalysis(fileText, cleanedOverrides);
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
      categoryId: tx.predictedCategoryId, // Include selected/predicted category
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

  const hasAmountField = mapping.amount || mapping.debit || mapping.credit;
  const isMappingValid = Boolean(mapping.date && mapping.description && hasAmountField);

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
          <p className="mt-2 text-sm text-muted-foreground">
            Detecting columns and categorizing transactions with AI
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            This may take up to a minute for large files
          </p>
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
              {FIELD_LABELS[field] || field}
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
                    <th key={header} className="px-2 py-1 text-start font-medium whitespace-nowrap">
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
            ({transactions.length} transactions
            {analysisStats ? `, ${analysisStats.excluded} filtered out` : ''})
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
              setFileText('');
              setHeaders([]);
              setRows([]);
              setMapping({});
              setTransactions([]);
              setExcludedRows([]);
              setAnalysisStats(null);
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

      {analysisStats && (
        <div className="text-sm text-muted-foreground">
          {analysisStats.included} included · {analysisStats.excluded} filtered ·{' '}
          {analysisStats.totalRows} total
        </div>
      )}
      {excludedRows.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Skipped rows:{' '}
          {excludedRows
            .slice(0, 3)
            .map((ex) => ex.reason)
            .join('; ')}
          {excludedRows.length > 3 ? '…' : ''}
        </div>
      )}

      {/* Transactions table */}
      {!isMappingValid ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Column mapping incomplete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Please map Date, Description, and Amount (or Debit/Credit) columns
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
                    <th className="px-4 py-2 text-start font-medium">Date</th>
                    <th className="px-4 py-2 text-start font-medium">Description</th>
                    <th className="px-4 py-2 text-end font-medium">Amount</th>
                    <th className="px-4 py-2 text-start font-medium">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Category
                      </span>
                    </th>
                    {mapping.balance && <th className="px-4 py-2 text-end font-medium">Balance</th>}
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
                          'px-4 py-2 text-end font-tabular-nums whitespace-nowrap',
                          tx.amount >= 0 ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {tx.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-2">
                        {availableCategories.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={tx.predictedCategoryId || ''}
                              onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                              className={cn(
                                'rounded-md border px-2 py-1 text-xs max-w-[160px]',
                                tx.predictedCategoryId
                                  ? 'border-primary/30 bg-primary/5 text-primary'
                                  : 'border-border bg-background text-muted-foreground'
                              )}
                            >
                              <option value="">Select category...</option>
                              {availableCategories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                            {tx.predictedConfidence !== undefined &&
                              tx.predictedConfidence < 100 && (
                                <span className="text-[10px] text-muted-foreground">
                                  {Math.round(tx.predictedConfidence)}%
                                </span>
                              )}
                          </div>
                        ) : tx.predictedCategoryName ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            <Tag className="h-3 w-3" />
                            {tx.predictedCategoryName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      {mapping.balance && (
                        <td className="px-4 py-2 text-end font-tabular-nums whitespace-nowrap">
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
            setFileText('');
            setHeaders([]);
            setRows([]);
            setMapping({});
            setTransactions([]);
            setImportResult(null);
            setExcludedRows([]);
            setAnalysisStats(null);
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
