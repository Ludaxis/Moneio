'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ZoomIn, ZoomOut, RotateCw, Maximize2, FileText, Image as ImageIcon } from 'lucide-react';

import { cn } from '@moneio/ui';

interface DocumentViewerProps {
  url: string;
  mimeType: string;
  fileName: string;
}

export function DocumentViewer({ url, mimeType, fileName }: DocumentViewerProps) {
  const t = useTranslations('documents');
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState(false);

  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  const handleZoomIn = () => setZoom((z) => Math.min(200, z + 25));
  const handleZoomOut = () => setZoom((z) => Math.max(25, z - 25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleFullscreen = () => {
    window.open(url, '_blank');
  };

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg bg-muted">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('previewError')}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          {t('openInNewTab')}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isImage && (
            <>
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 25}
                className="rounded-lg p-2 hover:bg-accent disabled:opacity-50"
                title={t('zoomOut')}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[4rem] text-center text-sm font-tabular-nums text-muted-foreground">
                {zoom}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 200}
                className="rounded-lg p-2 hover:bg-accent disabled:opacity-50"
                title={t('zoomIn')}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="mx-2 h-4 w-px bg-border" />
              <button
                onClick={handleRotate}
                className="rounded-lg p-2 hover:bg-accent"
                title={t('rotate')}
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <button
          onClick={handleFullscreen}
          className="rounded-lg p-2 hover:bg-accent"
          title={t('fullscreen')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Viewer */}
      <div className="relative min-h-[400px] overflow-auto rounded-lg border border-border bg-muted/50">
        {isPdf ? (
          <iframe
            src={`${url}#toolbar=0&navpanes=0`}
            className="h-[500px] w-full rounded-lg"
            title={fileName}
            onError={() => setError(true)}
          />
        ) : isImage ? (
          <div className="flex items-center justify-center p-4">
            <img
              src={url}
              alt={fileName}
              className="max-w-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              }}
              onError={() => setError(true)}
            />
          </div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('unsupportedFormat')}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t('downloadToView')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
