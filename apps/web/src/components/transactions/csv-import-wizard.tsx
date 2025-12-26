'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, ArrowRight, Check, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stepper,
  DataTable,
} from '@moneio/ui';

interface CSVImportWizardProps {
  onClose: () => void;
}

interface ParsedRow {
  date: string;
  amount: string;
  description: string;
  currency?: string;
  reference?: string;
}

interface ColumnMapping {
  date: string;
  amount: string;
  description: string;
  currency?: string;
  reference?: string;
}

const steps = [
  { id: 'upload', title: 'Upload CSV' },
  { id: 'mapping', title: 'Map Columns' },
  { id: 'preview', title: 'Preview' },
  { id: 'import', title: 'Import' },
];

export function CSVImportWizard({ onClose }: CSVImportWizardProps) {
  const t = useTranslations('transactions');
  const tCommon = useTranslations('common');
  const [currentStep, setCurrentStep] = useState(0);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: '',
    amount: '',
    description: '',
  });
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);

    // Parse CSV
    const text = await file.text();
    const lines = text.split('\n').filter((line) => line.trim());
    const parsedHeaders = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const parsedRows = lines.slice(1).map((line) => {
      // Handle quoted values with commas
      const matches = line.match(/("([^"]*)"|[^,]+)/g) || [];
      return matches.map((val) => val.trim().replace(/"/g, ''));
    });

    setHeaders(parsedHeaders);
    setRows(parsedRows);
    setCurrentStep(1);

    // Auto-detect column mapping
    const autoMapping: ColumnMapping = { date: '', amount: '', description: '' };
    parsedHeaders.forEach((header, index) => {
      const headerLower = header.toLowerCase();
      if (headerLower.includes('date') || headerLower.includes('posted')) {
        autoMapping.date = index.toString();
      } else if (headerLower.includes('amount') || headerLower.includes('sum')) {
        autoMapping.amount = index.toString();
      } else if (
        headerLower.includes('description') ||
        headerLower.includes('details') ||
        headerLower.includes('memo')
      ) {
        autoMapping.description = index.toString();
      } else if (headerLower.includes('currency')) {
        autoMapping.currency = index.toString();
      } else if (headerLower.includes('reference') || headerLower.includes('ref')) {
        autoMapping.reference = index.toString();
      }
    });
    setMapping(autoMapping);
  };

  const applyMapping = () => {
    const mapped = rows.map((row) => ({
      date: row[parseInt(mapping.date)] || '',
      amount: row[parseInt(mapping.amount)] || '',
      description: row[parseInt(mapping.description)] || '',
      currency: mapping.currency ? row[parseInt(mapping.currency)] : undefined,
      reference: mapping.reference ? row[parseInt(mapping.reference)] : undefined,
    }));
    setParsedRows(mapped);
    setCurrentStep(2);
  };

  const handleImport = async () => {
    setImporting(true);
    // TODO: Call API to import transactions
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setImporting(false);
    setImportComplete(true);
    setCurrentStep(3);
  };

  const previewColumns = [
    { key: 'date', header: 'Date', cell: (row: ParsedRow) => row.date },
    { key: 'description', header: 'Description', cell: (row: ParsedRow) => row.description },
    {
      key: 'amount',
      header: 'Amount',
      cell: (row: ParsedRow) => (
        <span className="tabular-nums">{row.amount}</span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('import')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Stepper steps={steps} currentStep={currentStep} />

          {/* Step 1: Upload */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div
                className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 p-8 hover:border-neutral-400"
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <Upload className="mb-4 h-10 w-10 text-neutral-400" />
                <p className="text-sm text-neutral-600">
                  Drop your CSV file here or click to select
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Map your CSV columns to the required fields
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date Column *</Label>
                  <Select value={mapping.date} onValueChange={(v) => setMapping({ ...mapping, date: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((header, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount Column *</Label>
                  <Select value={mapping.amount} onValueChange={(v) => setMapping({ ...mapping, amount: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((header, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description Column *</Label>
                  <Select value={mapping.description} onValueChange={(v) => setMapping({ ...mapping, description: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map((header, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency Column (optional)</Label>
                  <Select value={mapping.currency || ''} onValueChange={(v) => setMapping({ ...mapping, currency: v || undefined })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {headers.map((header, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={applyMapping}
                  disabled={!mapping.date || !mapping.amount || !mapping.description}
                >
                  {tCommon('next')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Preview of {parsedRows.length} transactions to import
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                <DataTable
                  data={parsedRows.slice(0, 10)}
                  columns={previewColumns}
                  keyExtractor={(_, i) => i.toString()}
                />
              </div>
              {parsedRows.length > 10 && (
                <p className="text-sm text-neutral-500">
                  And {parsedRows.length - 10} more...
                </p>
              )}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  {tCommon('back')}
                </Button>
                <Button onClick={handleImport} loading={importing}>
                  Import {parsedRows.length} transactions
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 3 && (
            <div className="flex flex-col items-center py-8">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-100 text-success-600">
                <Check className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-medium">Import Complete</h3>
              <p className="mt-2 text-neutral-600">
                Successfully imported {parsedRows.length} transactions
              </p>
              <Button className="mt-6" onClick={onClose}>
                {tCommon('close')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
