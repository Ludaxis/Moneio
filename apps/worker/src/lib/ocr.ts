import { ImageAnnotatorClient, protos } from '@google-cloud/vision';

// Initialize Vision client
let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    // Configure from environment
    const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

    // Log credential status for debugging
    console.log('[OCR] Initializing Google Vision client...');
    console.log(`[OCR] Project ID: ${projectId ? projectId : 'NOT SET'}`);
    console.log(
      `[OCR] Credentials: ${credentials ? (credentials.startsWith('{') ? 'JSON string provided' : 'File path provided') : 'NOT SET'}`
    );

    if (!projectId) {
      console.error('[OCR] WARNING: GOOGLE_CLOUD_PROJECT_ID is not set!');
    }
    if (!credentials) {
      console.error('[OCR] WARNING: GOOGLE_CLOUD_CREDENTIALS is not set!');
    }

    if (credentials) {
      try {
        // Credentials can be a JSON string or file path
        const parsedCredentials = credentials.startsWith('{') ? JSON.parse(credentials) : undefined;

        visionClient = new ImageAnnotatorClient({
          projectId,
          credentials: parsedCredentials,
          keyFilename: parsedCredentials ? undefined : credentials,
        });
        console.log('[OCR] Vision client initialized successfully');
      } catch (err) {
        console.error('[OCR] Failed to parse credentials:', err);
        visionClient = new ImageAnnotatorClient({ projectId });
      }
    } else {
      // Use default credentials (e.g., from GOOGLE_APPLICATION_CREDENTIALS)
      console.log('[OCR] Using default credentials (GOOGLE_APPLICATION_CREDENTIALS)');
      visionClient = new ImageAnnotatorClient({ projectId });
    }
  }
  return visionClient;
}

// ============================================================
// OCR Result Types
// ============================================================

export interface OcrTextBlock {
  text: string;
  confidence: number;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;
  };
  paragraphs: OcrParagraph[];
}

export interface OcrParagraph {
  text: string;
  confidence: number;
  words: OcrWord[];
}

export interface OcrWord {
  text: string;
  confidence: number;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;
  };
}

export interface OcrResult {
  fullText: string;
  blocks: OcrTextBlock[];
  confidence: number;
  language: string | null;
}

// ============================================================
// OCR Functions
// ============================================================

/**
 * Perform OCR on an image buffer
 */
export async function performOcr(imageData: Buffer, mimeType: string): Promise<OcrResult> {
  const client = getVisionClient();

  console.log(`[OCR] Processing file (${imageData.length} bytes, ${mimeType})`);

  // Validate input
  if (!imageData || imageData.length === 0) {
    throw new Error('OCR received empty image data');
  }

  // Log first few bytes to verify it's a valid file
  const header = imageData.subarray(0, 8).toString('hex');
  console.log(`[OCR] File header (hex): ${header}`);

  // Check for known file signatures
  const isPdf = header.startsWith('25504446') || mimeType === 'application/pdf';
  if (header.startsWith('89504e47')) {
    console.log('[OCR] Detected PNG file');
  } else if (header.startsWith('ffd8ff')) {
    console.log('[OCR] Detected JPEG file');
  } else if (isPdf) {
    console.log('[OCR] Detected PDF file');
  } else {
    console.log('[OCR] Unknown file format, treating as image');
  }

  try {
    let annotation: protos.google.cloud.vision.v1.ITextAnnotation | null | undefined;

    if (isPdf) {
      // For PDFs, use batchAnnotateFiles which supports inline PDF content
      console.log('[OCR] Using batchAnnotateFiles for PDF processing');

      const [result] = await client.batchAnnotateFiles({
        requests: [
          {
            inputConfig: {
              content: imageData.toString('base64'),
              mimeType: 'application/pdf',
            },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            // Process all pages (up to 5 for synchronous processing)
            pages: [1, 2, 3, 4, 5],
          },
        ],
      });

      // Extract text from all pages
      const responses = result.responses?.[0]?.responses || [];
      console.log(`[OCR] PDF processed, got ${responses.length} page response(s)`);

      if (responses.length === 0) {
        console.log('[OCR] No text detected in PDF');
        return {
          fullText: '',
          blocks: [],
          confidence: 0,
          language: null,
        };
      }

      // Combine text from all pages
      const fullTexts: string[] = [];
      for (const pageResponse of responses) {
        if (pageResponse.fullTextAnnotation?.text) {
          fullTexts.push(pageResponse.fullTextAnnotation.text);
        }
      }

      // Use first page's annotation for detailed block info
      annotation = responses[0]?.fullTextAnnotation;

      // Override fullText with combined text from all pages
      if (annotation && fullTexts.length > 0) {
        (annotation as { text: string }).text = fullTexts.join('\n\n--- Page Break ---\n\n');
      }
    } else {
      // For images, use documentTextDetection
      console.log('[OCR] Using documentTextDetection for image processing');

      const [response] = await client.documentTextDetection({
        image: { content: imageData.toString('base64') },
        imageContext: {
          languageHints: ['en', 'et', 'ar', 'fa'],
        },
      });

      annotation = response.fullTextAnnotation;

      if (response.error) {
        console.error(`[OCR] Vision API error in response:`, response.error);
      }
    }

    // Log response details for debugging
    console.log(`[OCR] Response received - has annotation: ${!!annotation}`);

    if (!annotation) {
      console.log('[OCR] No text detected in document');
      return {
        fullText: '',
        blocks: [],
        confidence: 0,
        language: null,
      };
    }

    // Parse blocks
    const blocks: OcrTextBlock[] = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const page of annotation.pages || []) {
      for (const block of page.blocks || []) {
        const blockParagraphs: OcrParagraph[] = [];
        let blockText = '';

        for (const paragraph of block.paragraphs || []) {
          const paragraphWords: OcrWord[] = [];
          let paragraphText = '';

          for (const word of paragraph.words || []) {
            const wordText =
              word.symbols?.map((s: protos.google.cloud.vision.v1.ISymbol) => s.text).join('') ||
              '';
            const wordConfidence = word.confidence || 0;

            paragraphWords.push({
              text: wordText,
              confidence: wordConfidence,
              boundingBox: {
                vertices: (word.boundingBox?.vertices || []).map(
                  (v: protos.google.cloud.vision.v1.IVertex) => ({
                    x: v.x || 0,
                    y: v.y || 0,
                  })
                ),
              },
            });

            paragraphText += wordText + ' ';
            totalConfidence += wordConfidence;
            confidenceCount++;
          }

          blockParagraphs.push({
            text: paragraphText.trim(),
            confidence: paragraph.confidence || 0,
            words: paragraphWords,
          });

          blockText += paragraphText;
        }

        blocks.push({
          text: blockText.trim(),
          confidence: block.confidence || 0,
          boundingBox: {
            vertices: (block.boundingBox?.vertices || []).map(
              (v: protos.google.cloud.vision.v1.IVertex) => ({
                x: v.x || 0,
                y: v.y || 0,
              })
            ),
          },
          paragraphs: blockParagraphs,
        });
      }
    }

    // Detect primary language
    const detectedLanguages = annotation.pages?.[0]?.property?.detectedLanguages || [];
    type DetectedLanguage = protos.google.cloud.vision.v1.TextAnnotation.IDetectedLanguage;
    const primaryLanguage =
      detectedLanguages.length > 0
        ? detectedLanguages.sort(
            (a: DetectedLanguage, b: DetectedLanguage) => (b.confidence || 0) - (a.confidence || 0)
          )[0].languageCode || null
        : null;

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    console.log(
      `[OCR] Extracted ${blocks.length} blocks, confidence: ${(averageConfidence * 100).toFixed(1)}%`
    );

    return {
      fullText: annotation.text || '',
      blocks,
      confidence: averageConfidence,
      language: primaryLanguage,
    };
  } catch (error) {
    // Log detailed error information for debugging
    console.error('[OCR] Google Vision API error:', error);

    // Check for common Google Cloud errors
    const err = error as { code?: string | number; details?: string; message?: string };
    if (err.code === 'UNAUTHENTICATED' || err.code === 16) {
      console.error('[OCR] Authentication failed - check GOOGLE_CLOUD_CREDENTIALS');
    } else if (err.code === 'PERMISSION_DENIED' || err.code === 7) {
      console.error('[OCR] Permission denied - ensure Cloud Vision API is enabled');
    } else if (err.code === 'NOT_FOUND' || err.code === 5) {
      console.error('[OCR] Resource not found - check GOOGLE_CLOUD_PROJECT_ID');
    }

    throw error;
  }
}

/**
 * Perform OCR with retry logic
 */
export async function performOcrWithRetry(
  imageData: Buffer,
  mimeType: string,
  maxRetries = 3
): Promise<OcrResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await performOcr(imageData, mimeType);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[OCR] Attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('OCR failed after retries');
}
