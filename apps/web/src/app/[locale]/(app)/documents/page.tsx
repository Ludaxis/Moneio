'use client';

import { cn } from '@moneio/ui';
import {
  FileText,
  Upload,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';

import { DocumentUploader } from '@/components/documents';
import { useWorkspace } from '@/lib/workspace';

type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'ocr_complete'
  | 'extracting'
  | 'ready'
  | 'failed';

interface Document {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: DocumentStatus;
  docType: string | null;
  pageCount: number | null;
  failReason: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<
  DocumentStatus,
  { icon: React.ElementType; color: string; labelKey: string }
> = {
  uploaded: { icon: Clock, color: 'text-muted-foreground', labelKey: 'statusUploaded' },
  processing: { icon: Loader2, color: 'text-blue-500 animate-spin', labelKey: 'statusProcessing' },
  ocr_complete: {
    icon: Loader2,
    color: 'text-blue-500 animate-spin',
    labelKey: 'statusOcrComplete',
  },
  extracting: { icon: Loader2, color: 'text-blue-500 animate-spin', labelKey: 'statusExtracting' },
  ready: { icon: CheckCircle2, color: 'text-success', labelKey: 'statusReady' },
  failed: { icon: AlertCircle, color: 'text-destructive', labelKey: 'statusFailed' },
};

const STATUS_OPTIONS: DocumentStatus[] = [
  'uploaded',
  'processing',
  'ocr_complete',
  'extracting',
  'ready',
  'failed',
];

export default function DocumentsPage() {
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(false);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const fetchDocuments = useCallback(async () => {
    if (!workspace) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        workspaceId: workspace.id,
        limit: String(limit),
        offset: String((page - 1) * limit),
      });
      if (statusFilter) {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/documents?${params}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  }, [workspace, page, statusFilter]);

  useEffect(() => {
    if (!workspaceLoading && workspace) {
      fetchDocuments();
    }
  }, [workspaceLoading, workspace, fetchDocuments]);

  const handleUploadComplete = () => {
    fetchDocuments();
    setShowUploader(false);
  };

  const totalPages = Math.ceil(total / limit);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (workspaceLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('noWorkspace')}</p>
        <Link
          href={`/${locale}/workspace/new`}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <button
          onClick={() => setShowUploader(!showUploader)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" />
          {t('upload')}
        </button>
      </div>

      {/* Uploader */}
      {showUploader && (
        <div className="rounded-lg border border-border bg-card p-4">
          <DocumentUploader workspaceId={workspace.id} onUploadComplete={handleUploadComplete} />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as DocumentStatus | '');
              setPage(1);
            }}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t('allStatuses')}</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {t(STATUS_CONFIG[status].labelKey)}
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">
          {total} {t('documentsCount')}
        </span>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{tCommon('noResults')}</p>
          <button
            onClick={() => setShowUploader(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="h-4 w-4" />
            {t('uploadFirst')}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                  {t('fileName')}
                </th>
                <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                  {t('status')}
                </th>
                <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                  {t('type')}
                </th>
                <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                  {t('size')}
                </th>
                <th className="px-4 py-3 text-start text-sm font-medium text-muted-foreground">
                  {t('createdAt')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((doc) => {
                const statusConfig = STATUS_CONFIG[doc.status];
                const StatusIcon = statusConfig.icon;

                return (
                  <tr
                    key={doc.id}
                    onClick={() =>
                      router.push(`/${locale}/documents/${doc.id}?workspace=${workspace.id}`)
                    }
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium text-foreground">{doc.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={cn('h-4 w-4', statusConfig.color)} />
                        <span className="text-sm">{t(statusConfig.labelKey)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {doc.docType || '-'}
                    </td>
                    <td className="px-4 py-3 font-tabular-nums text-sm text-muted-foreground">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(doc.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('page')} {page} {t('of')} {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg p-2 hover:bg-accent disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg p-2 hover:bg-accent disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
