import { ImageAnnotatorClient, protos } from '@google-cloud/vision';

// Initialize Vision client
let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    // Configure from environment
    const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

    if (credentials) {
      try {
        // Credentials can be a JSON string or file path
        const parsedCredentials = credentials.startsWith('{')
          ? JSON.parse(credentials)
          : undefined;

        visionClient = new ImageAnnotatorClient({
          projectId,
          credentials: parsedCredentials,
          keyFilename: parsedCredentials ? undefined : credentials,
        });
      } catch {
        visionClient = new ImageAnnotatorClient({ projectId });
      }
    } else {
      // Use default credentials (e.g., from GOOGLE_APPLICATION_CREDENTIALS)
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

  console.log(`[OCR] Processing image (${imageData.length} bytes, ${mimeType})`);

  try {
    // For PDFs, use documentTextDetection
    // For images, use textDetection
    const isPdf = mimeType === 'application/pdf';

    // For PDF and images, use documentTextDetection
    const [response] = await client.documentTextDetection({
      image: { content: imageData.toString('base64') },
      imageContext: {
        languageHints: ['en', 'et', 'ar', 'fa'],
      },
    });

    // Unused variable suppression for isPdf
    void isPdf;

    const annotation = response.fullTextAnnotation;

    if (!annotation) {
      console.log('[OCR] No text detected');
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
            const wordText = word.symbols?.map((s: protos.google.cloud.vision.v1.ISymbol) => s.text).join('') || '';
            const wordConfidence = word.confidence || 0;

            paragraphWords.push({
              text: wordText,
              confidence: wordConfidence,
              boundingBox: {
                vertices: (word.boundingBox?.vertices || []).map((v: protos.google.cloud.vision.v1.IVertex) => ({
                  x: v.x || 0,
                  y: v.y || 0,
                })),
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
            vertices: (block.boundingBox?.vertices || []).map((v: protos.google.cloud.vision.v1.IVertex) => ({
              x: v.x || 0,
              y: v.y || 0,
            })),
          },
          paragraphs: blockParagraphs,
        });
      }
    }

    // Detect primary language
    const detectedLanguages = annotation.pages?.[0]?.property?.detectedLanguages || [];
    type DetectedLanguage = protos.google.cloud.vision.v1.TextAnnotation.IDetectedLanguage;
    const primaryLanguage = detectedLanguages.length > 0
      ? detectedLanguages.sort((a: DetectedLanguage, b: DetectedLanguage) => (b.confidence || 0) - (a.confidence || 0))[0].languageCode || null
      : null;

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    console.log(`[OCR] Extracted ${blocks.length} blocks, confidence: ${(averageConfidence * 100).toFixed(1)}%`);

    return {
      fullText: annotation.text || '',
      blocks,
      confidence: averageConfidence,
      language: primaryLanguage,
    };
  } catch (error) {
    console.error('[OCR] Google Vision API error:', error);
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
