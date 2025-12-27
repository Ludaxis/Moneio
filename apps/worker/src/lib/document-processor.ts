import { PDFDocument } from 'pdf-lib';

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
 * Get image info using basic buffer analysis
 * Note: For production, use sharp or similar library
 */
async function getImageInfo(data: Buffer, mimeType: string): Promise<DocumentInfo> {
  let width: number | undefined;
  let height: number | undefined;
  let format: string | undefined;

  // Try to extract dimensions from common image formats
  if (mimeType === 'image/png') {
    // PNG: width at bytes 16-19, height at bytes 20-23 (big endian)
    if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) {
      width = data.readUInt32BE(16);
      height = data.readUInt32BE(20);
      format = 'png';
    }
  } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    // JPEG: Need to parse segments to find SOF marker
    const dimensions = parseJpegDimensions(data);
    if (dimensions) {
      width = dimensions.width;
      height = dimensions.height;
      format = 'jpeg';
    }
  } else if (mimeType === 'image/gif') {
    // GIF: width at bytes 6-7, height at bytes 8-9 (little endian)
    if (data.length > 10 && data[0] === 0x47 && data[1] === 0x49) {
      width = data.readUInt16LE(6);
      height = data.readUInt16LE(8);
      format = 'gif';
    }
  } else if (mimeType === 'image/webp') {
    format = 'webp';
    // WebP parsing is more complex, skip for now
  }

  return {
    pageCount: 1,
    width,
    height,
    format,
  };
}

/**
 * Parse JPEG dimensions from buffer
 */
function parseJpegDimensions(data: Buffer): { width: number; height: number } | null {
  // JPEG starts with FFD8
  if (data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < data.length - 8) {
    // Find next marker
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = data[offset + 1];

    // SOF markers (Start of Frame)
    if (
      marker === 0xc0 || // SOF0 (Baseline)
      marker === 0xc1 || // SOF1 (Extended sequential)
      marker === 0xc2 // SOF2 (Progressive)
    ) {
      // Height at offset+5, Width at offset+7
      const height = data.readUInt16BE(offset + 5);
      const width = data.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip this segment
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
    } else {
      const segmentLength = data.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }

  return null;
}

/**
 * Extract pages from a PDF as images
 * Note: This is a placeholder - full implementation requires pdf-to-image library
 */
export async function extractPdfPages(
  data: Buffer,
  _pageNumbers?: number[]
): Promise<ProcessedPage[]> {
  // For MVP, we'll pass the PDF directly to OCR
  // Google Vision can handle PDFs natively
  const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  const pages: ProcessedPage[] = [];

  // Create a single-page PDF for each page
  for (let i = 0; i < pageCount; i++) {
    const singlePagePdf = await PDFDocument.create();
    const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
    singlePagePdf.addPage(copiedPage);

    const pdfBytes = await singlePagePdf.save();

    pages.push({
      pageNumber: i + 1,
      data: Buffer.from(pdfBytes),
      mimeType: 'application/pdf',
    });
  }

  return pages;
}

/**
 * Normalize an image (resize if too large, convert format if needed)
 * Note: For production, use sharp library
 */
export async function normalizeImage(
  data: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string }> {
  // For MVP, pass through as-is
  // In production, would use sharp to:
  // - Resize if > 4096px on any side (Google Vision limit)
  // - Convert HEIC to JPEG
  // - Strip EXIF data if needed

  return { data, mimeType };
}
