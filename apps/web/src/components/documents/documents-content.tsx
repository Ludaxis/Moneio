'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Upload, Filter } from 'lucide-react';
import { Button, EmptyState, FilterBar, Badge, DataTable } from '@moneio/ui';
import { DocumentUpload } from './document-upload';

interface Document {
  id: string;
  fileName: string;
  type: 'invoice' | 'receipt' | 'statement' | 'other';
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  createdAt: string;
}

export function DocumentsContent() {
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [documents] = useState<Document[]>([]); // Will be fetched from API

  const statusColors = {
    uploaded: 'secondary',
    processing: 'warning',
    ready: 'success',
    failed: 'danger',
  } as const;

  const columns = [
    {
      key: 'fileName',
      header: 'File',
      cell: (row: Document) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-neutral-400" />
          <span className="font-medium">{row.fileName}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('type'),
      cell: (row: Document) => (
        <Badge variant="secondary">{t(row.type)}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: Document) => (
        <Badge variant={statusColors[row.status]}>{t(row.status)}</Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Uploaded',
      cell: (row: Document) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={`${tCommon('search')} ${t('title').toLowerCase()}...`}
        filters={
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            {tCommon('filter')}
          </Button>
        }
        actions={
          <Button onClick={() => setShowUpload(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t('upload')}
          </Button>
        }
      />

      {documents.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-12 dark:border-neutral-700 dark:bg-neutral-800">
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title={t('noDocuments')}
            description={t('uploadFirst')}
            action={
              <Button onClick={() => setShowUpload(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {t('upload')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          <DataTable
            data={documents}
            columns={columns}
            keyExtractor={(row) => row.id}
            onRowClick={(row) => console.log('View document:', row.id)}
          />
        </div>
      )}

      {showUpload && (
        <DocumentUpload onClose={() => setShowUpload(false)} />
      )}
    </div>
  );
}
