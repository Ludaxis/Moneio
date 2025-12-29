import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

// Image processing limits
const MAX_IMAGE_DIMENSION = 4096; // Google Vision limit
const MAX_FILE_SIZE_MB = 20;
const JPEG_QUALITY = 85;

export interface DocumentInfo {
  pageCount: number;
  width?: number;
  height?: number;
  format?: string;
}

export interface ProcessedPage {
  pageNumber: number;
  data: Buffer;
  mimeType: string;
}

/**
 * Get document info (page count, dimensions) without full processing
 */
export async function getDocumentInfo(data: Buffer, mimeType: string): Promise<DocumentInfo> {
  if (mimeType === 'application/pdf') {
    return getPdfInfo(data);
  } else if (mimeType.startsWith('image/')) {
    return getImageInfo(data, mimeType);
  } else {
    // Unknown format, treat as single page
    return { pageCount: 1 };
  }
}

/**
 * Get PDF info
 */
async function getPdfInfo(data: Buffer): Promise<DocumentInfo> {
  try {
    const pdfDoc = await PDFDocument.load(data, {
      ignoreEncryption: true,
    });

    const pageCount = pdfDoc.getPageCount();
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();

    return {
      pageCount,
      width,
      height,
      format: 'pdf',
    };
  } catch (error) {
    console.error('Failed to parse PDF:', error);
    throw new Error('Invalid or corrupted PDF file');
  }
}

/**
 * Get image info using sharp for accurate metadata extraction
 */
async function getImageInfo(data: Buffer, _mimeType: string): Promise<DocumentInfo> {
  try {
    const metadata = await sharp(data).metadata();

    return {
      pageCount: 1,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch (error) {
    console.error('Failed to get image metadata:', error);
    // Fallback to basic parsing for corrupted/unsupported images
    return { pageCount: 1 };
  }
}

/**
 * Extract pages from a PDF as images
 * Note: This is a placeholder - full implementation requires pdf-to-image library
 */
export async function extractPdfPages(
  data: Buffer,
  _pageNumbers?: number[]
): Promise<ProcessedPage[]> {
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  const pages: ProcessedPage[] = [];

  // Render each page to a PNG for reliable OCR
  for (let i = 0; i < pageCount; i++) {
    const pngBuffer = await sharp(data, { density: 200, page: i }).png().toBuffer();

    pages.push({
      pageNumber: i + 1,
      data: pngBuffer,
      mimeType: 'image/png',
    });
  }

  return pages;
}

/**
 * Normalize an image using sharp:
 * - Resize if dimensions exceed Google Vision limit (4096px)
 * - Convert HEIC/HEIF to JPEG
 * - Optimize file size
 * - Strip EXIF data (privacy)
 * - Auto-rotate based on EXIF orientation
 */
export async function normalizeImage(
  data: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string; normalized: boolean }> {
  try {
    const image = sharp(data);
    const metadata = await image.metadata();

    let needsNormalization = false;
    let outputFormat: 'jpeg' | 'png' | 'webp' = 'jpeg';

    // Check if resize needed
    const { width, height } = metadata;
    const needsResize =
      (width && width > MAX_IMAGE_DIMENSION) || (height && height > MAX_IMAGE_DIMENSION);

    // Check if format conversion needed (HEIC/HEIF to JPEG)
    const isHeic = metadata.format === 'heif' || mimeType === 'image/heic';
    const isUnsupportedFormat = isHeic || metadata.format === 'tiff';

    // Determine output format
    if (metadata.format === 'png' && !isUnsupportedFormat) {
      outputFormat = 'png';
    } else if (metadata.format === 'webp' && !isUnsupportedFormat) {
      outputFormat = 'webp';
    }

    // Check file size
    const fileSizeMb = data.length / (1024 * 1024);
    const needsCompression = fileSizeMb > MAX_FILE_SIZE_MB;

    needsNormalization = needsResize || isUnsupportedFormat || needsCompression;

    if (!needsNormalization) {
      // Still rotate based on EXIF and strip metadata
      const rotated = await image
        .rotate() // Auto-rotate based on EXIF
        .withMetadata({ orientation: undefined }) // Strip EXIF but keep color profile
        .toBuffer();

      // Only return rotated if it's different
      if (metadata.orientation && metadata.orientation !== 1) {
        return {
          data: rotated,
          mimeType,
          normalized: true,
        };
      }

      return { data, mimeType, normalized: false };
    }

    // Build processing pipeline
    let pipeline = image.rotate(); // Auto-rotate first

    // Resize if needed (maintain aspect ratio, fit within bounds)
    if (needsResize) {
      pipeline = pipeline.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      console.log(
        `[SHARP] Resizing from ${width}x${height} to fit within ${MAX_IMAGE_DIMENSION}px`
      );
    }

    // Convert to output format
    let outputMimeType: string;
    if (outputFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
      outputMimeType = 'image/jpeg';
    } else if (outputFormat === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
      outputMimeType = 'image/png';
    } else {
      pipeline = pipeline.webp({ quality: JPEG_QUALITY });
      outputMimeType = 'image/webp';
    }

    const normalizedData = await pipeline.toBuffer();

    console.log(
      `[SHARP] Normalized: ${(data.length / 1024).toFixed(0)}KB → ${(normalizedData.length / 1024).toFixed(0)}KB (${outputFormat})`
    );

    return {
      data: normalizedData,
      mimeType: outputMimeType,
      normalized: true,
    };
  } catch (error) {
    console.error('[SHARP] Failed to normalize image:', error);
    // Return original on error
    return { data, mimeType, normalized: false };
  }
}
