'use client';

import { cn } from '@moneio/ui';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useRef } from 'react';

interface DocumentUploaderProps {
  workspaceId: string;
  onUploadComplete?: (document: unknown) => void;
  onUploadError?: (error: Error) => void;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function DocumentUploader({
  workspaceId,
  onUploadComplete,
  onUploadError,
}: DocumentUploaderProps) {
  const t = useTranslations('documents');
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateFileStatus = (id: string, updates: Partial<UploadingFile>) => {
    setUploadingFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const uploadFile = async (file: File) => {
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    setUploadingFiles((prev) => [...prev, { id: fileId, file, progress: 0, status: 'uploading' }]);

    try {
      // Step 1: Get signed upload URL
      const urlResponse = await fetch('/api/documents/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          fileName: file.name,
          mimeType: file.type,
        }),
      });

      if (!urlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { signedUrl, path } = await urlResponse.json();

      // Step 2: Upload file directly to storage
      updateFileStatus(fileId, { progress: 30 });

      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      updateFileStatus(fileId, { progress: 70, status: 'processing' });

      // Step 3: Create document record
      const docResponse = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          storagePath: path,
        }),
      });

      if (!docResponse.ok) {
        throw new Error('Failed to create document');
      }

      const document = await docResponse.json();

      updateFileStatus(fileId, { progress: 100, status: 'complete' });
      onUploadComplete?.(document);

      // Remove from list after a delay
      setTimeout(() => {
        setUploadingFiles((prev) => prev.filter((f) => f.id !== fileId));
      }, 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      updateFileStatus(fileId, { status: 'error', error: errorMessage });
      onUploadError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  };

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      Array.from(files).forEach((file) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          console.warn(`Unsupported file type: ${file.type}`);
          return;
        }

        if (file.size > MAX_FILE_SIZE) {
          console.warn(`File too large: ${file.name}`);
          return;
        }

        uploadFile(file);
      });
    },
    [workspaceId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/50'
        )}
      >
        <Upload className="h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-sm font-medium text-foreground">{t('upload')}</p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, WebP, HEIC (max 50MB)</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{upload.file.name}</p>
                {upload.status === 'uploading' || upload.status === 'processing' ? (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                ) : upload.status === 'error' ? (
                  <p className="mt-1 text-xs text-destructive">{upload.error}</p>
                ) : null}
              </div>
              {upload.status === 'complete' && <CheckCircle2 className="h-5 w-5 text-success" />}
              {upload.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
