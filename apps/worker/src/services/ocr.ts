import { ImageAnnotatorClient } from '@google-cloud/vision';
import type { OcrPayload, OcrPage, OcrBlock, BoundingBox } from '@moneio/core-ledger';
import { config } from '../config.js';

let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    const credentials = config.GOOGLE_APPLICATION_CREDENTIALS_JSON
      ? JSON.parse(config.GOOGLE_APPLICATION_CREDENTIALS_JSON)
      : undefined;

    visionClient = new ImageAnnotatorClient({
      credentials,
      projectId: config.GOOGLE_CLOUD_PROJECT_ID,
    });
  }
  return visionClient;
}

export async function performOcr(imageBuffer: Buffer): Promise<OcrPayload> {
  const client = getVisionClient();

  const [result] = await client.documentTextDetection({
    image: { content: imageBuffer },
  });

  const fullTextAnnotation = result.fullTextAnnotation;

  if (!fullTextAnnotation) {
    return {
      fullText: '',
      pages: [],
      provider: 'google-vision',
      processedAt: new Date().toISOString(),
    };
  }

  const pages: OcrPage[] = [];

  for (let pageIdx = 0; pageIdx < (fullTextAnnotation.pages?.length || 0); pageIdx++) {
    const page = fullTextAnnotation.pages![pageIdx];
    const blocks: OcrBlock[] = [];

    for (const block of page.blocks || []) {
      const text = block.paragraphs
        ?.map((p) =>
          p.words?.map((w) => w.symbols?.map((s) => s.text).join('')).join(' ')
        )
        .join('\n') || '';

      const vertices = block.boundingBox?.vertices || [];
      const boundingBox: BoundingBox = {
        x: vertices[0]?.x || 0,
        y: vertices[0]?.y || 0,
        width: (vertices[2]?.x || 0) - (vertices[0]?.x || 0),
        height: (vertices[2]?.y || 0) - (vertices[0]?.y || 0),
      };

      blocks.push({
        text,
        boundingBox,
        confidence: block.confidence || 0,
      });
    }

    const pageText = blocks.map((b) => b.text).join('\n');

    pages.push({
      pageNumber: pageIdx + 1,
      text: pageText,
      blocks,
      width: page.width || 0,
      height: page.height || 0,
    });
  }

  return {
    fullText: fullTextAnnotation.text || '',
    pages,
    provider: 'google-vision',
    processedAt: new Date().toISOString(),
  };
}
