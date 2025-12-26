'use client';

import { cn } from '@moneio/ui';
import {
  CheckCircle2,
  Edit2,
  X,
  Save,
  AlertTriangle,
  Building2,
  Calendar,
  Hash,
  DollarSign,
  FileText,
  Package,
  Percent,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

interface LineItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
  lineTotal?: number;
  total?: number;
}

interface InvoicePayload {
  kind: 'invoice';
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorVatId?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerVatId?: string;
  currency?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  lineItems?: LineItem[];
}

interface ReceiptPayload {
  kind: 'receipt';
  merchantName?: string;
  merchantAddress?: string;
  date?: string;
  currency?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  paymentMethod?: string;
  items?: LineItem[];
}

interface StatementPayload {
  kind: 'statement';
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  iban?: string;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
}

type ExtractionPayload = InvoicePayload | ReceiptPayload | StatementPayload | { kind?: string; [key: string]: unknown };

interface Extraction {
  id: string;
  version: number;
  payloadJson: ExtractionPayload;
  approved: boolean;
  createdAt: string;
}

interface ExtractionReviewPanelProps {
  extraction: Extraction;
  workspaceId: string;
  documentId: string;
  onUpdate?: () => void;
}

export function ExtractionReviewPanel({
  extraction,
  workspaceId,
  documentId,
  onUpdate,
}: ExtractionReviewPanelProps) {
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');
  const tInvoices = useTranslations('invoices');

  const [isEditing, setIsEditing] = useState(false);
  const [editedPayload, setEditedPayload] = useState<ExtractionPayload>(extraction.payloadJson);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const payload = extraction.payloadJson;
  const kind = payload.kind || 'unknown';
  const confidence = (payload as Record<string, unknown>)._confidence as number | undefined;

  const handleFieldChange = useCallback((field: string, value: string | number | null) => {
    setEditedPayload((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/extraction`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          extractionId: extraction.id,
          payload: editedPayload,
        }),
      });

      if (response.ok) {
        setIsEditing(false);
        onUpdate?.();
      }
    } catch (error) {
      console.error('Failed to save extraction:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/extraction/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          extractionId: extraction.id,
        }),
      });

      if (response.ok) {
        onUpdate?.();
      }
    } catch (error) {
      console.error('Failed to approve extraction:', error);
    } finally {
      setApproving(false);
    }
  };

  const handleCancel = () => {
    setEditedPayload(extraction.payloadJson);
    setIsEditing(false);
  };

  const renderField = (
    label: string,
    value: string | number | undefined | null,
    field: string,
    icon?: React.ReactNode,
    type: 'text' | 'number' | 'date' = 'text'
  ) => {
    const displayValue = value ?? '-';
    const editValue = (editedPayload as Record<string, unknown>)[field] as string | number | undefined;

    return (
      <div className="flex items-start gap-3 py-3">
        {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {label}
          </p>
          {isEditing ? (
            <input
              type={type}
              value={editValue ?? ''}
              onChange={(e) => {
                const val = type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
                handleFieldChange(field, val);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          ) : (
            <p className={cn('text-sm font-medium', type === 'number' && 'font-tabular-nums')}>
              {type === 'number' && typeof displayValue === 'number'
                ? displayValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : displayValue}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderInvoice = (data: InvoicePayload) => (
    <div className="space-y-1 divide-y divide-border">
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField(tInvoices('number'), data.invoiceNumber, 'invoiceNumber', <Hash className="h-4 w-4" />)}
        {renderField(t('type'), 'Invoice', 'kind', <FileText className="h-4 w-4" />)}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField(tInvoices('date'), data.issueDate, 'issueDate', <Calendar className="h-4 w-4" />, 'date')}
        {renderField(tInvoices('dueDate'), data.dueDate, 'dueDate', <Calendar className="h-4 w-4" />, 'date')}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField(tInvoices('vendor'), data.vendorName, 'vendorName', <Building2 className="h-4 w-4" />)}
        {renderField('VAT ID', data.vendorVatId, 'vendorVatId')}
      </div>
      <div className="grid gap-1 sm:grid-cols-3">
        {renderField('Subtotal', data.subtotal, 'subtotal', <DollarSign className="h-4 w-4" />, 'number')}
        {renderField(tInvoices('vat'), data.vatTotal, 'vatTotal', <Percent className="h-4 w-4" />, 'number')}
        {renderField(tInvoices('total'), data.total, 'total', <DollarSign className="h-4 w-4" />, 'number')}
      </div>
      {data.lineItems && data.lineItems.length > 0 && (
        <div className="pt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Line Items ({data.lineItems.length})
          </p>
          <div className="space-y-2">
            {data.lineItems.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-md bg-muted/50 p-2 text-sm"
              >
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{item.description || '-'}</span>
                <span className="font-tabular-nums text-muted-foreground">
                  {item.quantity ?? 1} x {item.unitPrice?.toLocaleString() ?? 0}
                </span>
                <span className="font-tabular-nums font-medium">
                  {(item.lineTotal ?? item.total ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderReceipt = (data: ReceiptPayload) => (
    <div className="space-y-1 divide-y divide-border">
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField('Merchant', data.merchantName, 'merchantName', <Building2 className="h-4 w-4" />)}
        {renderField(t('type'), 'Receipt', 'kind', <FileText className="h-4 w-4" />)}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField(tInvoices('date'), data.date, 'date', <Calendar className="h-4 w-4" />, 'date')}
        {renderField('Payment Method', data.paymentMethod, 'paymentMethod')}
      </div>
      <div className="grid gap-1 sm:grid-cols-3">
        {renderField('Subtotal', data.subtotal, 'subtotal', <DollarSign className="h-4 w-4" />, 'number')}
        {renderField(tInvoices('vat'), data.vatTotal, 'vatTotal', <Percent className="h-4 w-4" />, 'number')}
        {renderField(tInvoices('total'), data.total, 'total', <DollarSign className="h-4 w-4" />, 'number')}
      </div>
      {data.items && data.items.length > 0 && (
        <div className="pt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Items ({data.items.length})
          </p>
          <div className="space-y-2">
            {data.items.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-md bg-muted/50 p-2 text-sm"
              >
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{item.description || '-'}</span>
                <span className="font-tabular-nums font-medium">
                  {(item.total ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderStatement = (data: StatementPayload) => (
    <div className="space-y-1 divide-y divide-border">
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField('Bank', data.bankName, 'bankName', <Building2 className="h-4 w-4" />)}
        {renderField('Account', data.accountName, 'accountName')}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField('Account Number', data.accountNumber, 'accountNumber')}
        {renderField('IBAN', data.iban, 'iban')}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField('Period Start', data.periodStart, 'periodStart', <Calendar className="h-4 w-4" />, 'date')}
        {renderField('Period End', data.periodEnd, 'periodEnd', <Calendar className="h-4 w-4" />, 'date')}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {renderField('Opening Balance', data.openingBalance, 'openingBalance', <DollarSign className="h-4 w-4" />, 'number')}
        {renderField('Closing Balance', data.closingBalance, 'closingBalance', <DollarSign className="h-4 w-4" />, 'number')}
      </div>
    </div>
  );

  const renderUnknown = (data: Record<string, unknown>) => (
    <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-4 text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Version {extraction.version}
          </span>
          {confidence !== undefined && (
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                confidence >= 80
                  ? 'bg-success/10 text-success'
                  : confidence >= 50
                    ? 'bg-warning/10 text-warning'
                    : 'bg-destructive/10 text-destructive'
              )}
            >
              {confidence < 80 && <AlertTriangle className="h-3 w-3" />}
              {confidence}% {t('confidence')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {extraction.approved ? (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              {t('approved')}
            </span>
          ) : isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                <X className="h-4 w-4" />
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? tCommon('loading') : tCommon('save')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Edit2 className="h-4 w-4" />
                {tCommon('edit')}
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-1 rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {approving ? tCommon('loading') : tCommon('approve')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        {kind === 'invoice' && renderInvoice(payload as InvoicePayload)}
        {kind === 'receipt' && renderReceipt(payload as ReceiptPayload)}
        {kind === 'statement' && renderStatement(payload as StatementPayload)}
        {!['invoice', 'receipt', 'statement'].includes(kind) && renderUnknown(payload as Record<string, unknown>)}
      </div>
    </div>
  );
}
