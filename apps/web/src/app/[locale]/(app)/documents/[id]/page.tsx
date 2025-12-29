'use client';

import { cn } from '@moneio/ui';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  File,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

import { DocumentViewer, ExtractionReviewPanel } from '@/components/documents';

type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'ocr_complete'
  | 'extracting'
  | 'ready'
  | 'failed';

interface DocumentBlob {
  id: string;
  storagePath: string;
  blobType: string;
}

interface Extraction {
  id: string;
  version: number;
  payloadJson: Record<string, unknown>;
  approved: boolean;
  createdAt: string;
}

interface DocumentDetail {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: DocumentStatus;
  docType: string | null;
  pageCount: number | null;
  failReason: string | null;
  createdAt: string;
  updatedAt: string;
  blobs: DocumentBlob[];
  extractions: Extraction[];
}

const STATUS_CONFIG: Record<
  DocumentStatus,
  { icon: React.ElementType; color: string; bgColor: string; labelKey: string }
> = {
  uploaded: {
    icon: Clock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    labelKey: 'statusUploaded',
  },
  processing: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    labelKey: 'statusProcessing',
  },
  ocr_complete: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    labelKey: 'statusOcrComplete',
  },
  extracting: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    labelKey: 'statusExtracting',
  },
  ready: {
    icon: CheckCircle2,
    color: 'text-success',
    bgColor: 'bg-success/10',
    labelKey: 'statusReady',
  },
  failed: {
    icon: AlertCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    labelKey: 'statusFailed',
  },
};

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async (action: 'cancel' | 'retry') => {
    if (!workspaceId || !document) return;

    setCancelling(true);
    try {
      const response = await fetch(`/api/documents/${params.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, action }),
      });

      if (response.ok) {
        // Refresh document to get new status
        await fetchDocument(true);
      }
    } catch (error) {
      console.error('Failed to cancel document:', error);
    } finally {
      setCancelling(false);
    }
  };

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const fetchDocument = async (isRefresh = false) => {
    if (!workspaceId) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch(`/api/documents/${params.id}?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setDocument(data.document);
        setViewUrl(data.viewUrl);
      }
    } catch (error) {
      console.error('Failed to fetch document:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDocument();
  }, [params.id, workspaceId]);

  // Auto-refresh for processing documents
  useEffect(() => {
    if (!document) return undefined;

    const processingStatuses: DocumentStatus[] = [
      'uploaded',
      'processing',
      'ocr_complete',
      'extracting',
    ];
    if (processingStatuses.includes(document.status)) {
      const interval = setInterval(() => {
        fetchDocument(true);
      }, 5000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [document?.status]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t('documentNotFound')}</p>
        <Link
          href={`/${locale}/documents${workspaceId ? `?workspace=${workspaceId}` : ''}`}
          className="flex items-center gap-2 text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToList')}
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[document.status];
  const StatusIcon = statusConfig.icon;
  const isProcessing = ['processing', 'ocr_complete', 'extracting'].includes(document.status);
  const latestExtraction = document.extractions[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/documents${workspaceId ? `?workspace=${workspaceId}` : ''}`}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">{document.fileName}</h1>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(document.fileSize)} • {formatDate(document.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchDocument(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            {tCommon('loading')}
          </button>
          {viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-4 w-4" />
              {tCommon('download')}
            </a>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div className={cn('flex items-center justify-between rounded-lg p-4', statusConfig.bgColor)}>
        <div className="flex items-center gap-3">
          <StatusIcon
            className={cn('h-5 w-5', statusConfig.color, isProcessing && 'animate-spin')}
          />
          <div>
            <p className={cn('font-medium', statusConfig.color)}>{t(statusConfig.labelKey)}</p>
            {document.failReason && (
              <p className="mt-1 text-sm text-destructive">{document.failReason}</p>
            )}
            {isProcessing && (
              <p className="mt-1 text-sm text-muted-foreground">{t('processingNote')}</p>
            )}
          </div>
        </div>
        {/* Cancel/Retry buttons */}
        <div className="flex items-center gap-2">
          {isProcessing && (
            <button
              onClick={() => handleCancel('cancel')}
              disabled={cancelling}
              className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {tCommon('cancel')}
            </button>
          )}
          {document.status === 'failed' && (
            <button
              onClick={() => handleCancel('retry')}
              disabled={cancelling}
              className="flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {tCommon('retry')}
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Document Viewer */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold text-foreground">{t('preview')}</h2>
          </div>
          <div className="p-4">
            {viewUrl ? (
              <DocumentViewer
                url={viewUrl}
                mimeType={document.mimeType}
                fileName={document.fileName}
              />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg bg-muted">
                <File className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">{t('noPreview')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Info Panel */}
        <div className="space-y-6">
          {/* Document Info */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold text-foreground">{t('details')}</h2>
            </div>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-muted-foreground">{t('fileName')}</span>
                <span className="text-sm font-medium text-foreground">{document.fileName}</span>
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-muted-foreground">{t('type')}</span>
                <span className="text-sm font-medium text-foreground">
                  {document.docType || document.mimeType}
                </span>
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-muted-foreground">{t('size')}</span>
                <span className="font-tabular-nums text-sm font-medium text-foreground">
                  {formatFileSize(document.fileSize)}
                </span>
              </div>
              {document.pageCount && (
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm text-muted-foreground">{t('pages')}</span>
                  <span className="font-tabular-nums text-sm font-medium text-foreground">
                    {document.pageCount}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-muted-foreground">{t('uploaded')}</span>
                <span className="text-sm font-medium text-foreground">
                  {formatDate(document.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Extraction Panel */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold text-foreground">{t('extractedData')}</h2>
            </div>
            <div className="p-4">
              {latestExtraction && workspaceId ? (
                <ExtractionReviewPanel
                  extraction={latestExtraction}
                  workspaceId={workspaceId}
                  documentId={document.id}
                  onUpdate={() => fetchDocument(true)}
                />
              ) : document.status === 'ready' ? (
                <p className="text-sm text-muted-foreground">{t('noExtractions')}</p>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('extractionPending')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
