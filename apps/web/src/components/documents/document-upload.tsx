'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, X, File, Check, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from '@moneio/ui';

interface DocumentUploadProps {
  onClose: () => void;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export function DocumentUpload({ onClose }: DocumentUploadProps) {
  const t = useTranslations('documents');
  const tCommon = useTranslations('common');
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter((file) => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      return validTypes.includes(file.type);
    });

    const uploadingFiles: UploadingFile[] = validFiles.map((file) => ({
      file,
      progress: 0,
      status: 'pending',
    }));

    setFiles((prev) => [...prev, ...uploadingFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    // Update all files to uploading status
    setFiles((prev) =>
      prev.map((f) => (f.status === 'pending' ? { ...f, status: 'uploading' as const } : f))
    );

    // TODO: Implement actual upload logic with Supabase Storage
    // For now, simulate upload
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending' && files[i].status !== 'uploading') continue;

      // Simulate progress
      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, progress } : f))
        );
      }

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'success' as const } : f))
      );
    }
  };

  const allComplete = files.length > 0 && files.every((f) => f.status === 'success');
  const hasFiles = files.length > 0;
  const hasPending = files.some((f) => f.status === 'pending');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('upload')}</DialogTitle>
          <DialogDescription>{t('dragDrop')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              isDragOver
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-neutral-300 hover:border-neutral-400 dark:border-neutral-600'
            }`}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            <Upload className="mb-4 h-10 w-10 text-neutral-400" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('dragDrop')}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              PDF, JPG, PNG up to 10MB
            </p>
          </div>

          {/* File list */}
          {hasFiles && (
            <div className="space-y-2">
              {files.map((uploadFile, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <File className="h-5 w-5 text-neutral-400" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {uploadFile.file.name}
                    </p>
                    {uploadFile.status === 'uploading' && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                        <div
                          className="h-full bg-primary-600 transition-all duration-200"
                          style={{ width: `${uploadFile.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {uploadFile.status === 'pending' && (
                      <button onClick={() => removeFile(index)} className="text-neutral-400 hover:text-neutral-600">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                    )}
                    {uploadFile.status === 'success' && (
                      <Check className="h-4 w-4 text-success-600" />
                    )}
                    {uploadFile.status === 'error' && (
                      <AlertCircle className="h-4 w-4 text-danger-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {allComplete ? tCommon('close') : tCommon('cancel')}
            </Button>
            {hasPending && (
              <Button onClick={uploadFiles}>
                <Upload className="mr-2 h-4 w-4" />
                Upload {files.filter((f) => f.status === 'pending').length} files
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
