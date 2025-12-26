import OpenAI from 'openai';
import { z } from 'zod';
import type { OcrPayload } from '@moneio/core-ledger';
import { config } from '../config.js';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

// Invoice extraction schema
const invoiceSchema = z.object({
  documentType: z.enum(['invoice', 'receipt', 'statement', 'other']),
  invoiceNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  vendorName: z.string().nullable(),
  vendorAddress: z.string().nullable(),
  vendorVatId: z.string().nullable(),
  buyerName: z.string().nullable(),
  buyerAddress: z.string().nullable(),
  buyerVatId: z.string().nullable(),
  currency: z.string().default('EUR'),
  subtotal: z.number().nullable(),
  vatTotal: z.number().nullable(),
  total: z.number().nullable(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().default(1),
      unitPrice: z.number(),
      vatRate: z.number().nullable(),
      lineTotal: z.number(),
    })
  ).default([]),
});

export type InvoiceExtraction = z.infer<typeof invoiceSchema>;

const MAX_RETRIES = 2;

export async function extractInvoiceData(
  ocrPayload: OcrPayload,
  locale: string = 'en',
  baseCurrency: string = 'EUR'
): Promise<{ extraction: InvoiceExtraction; confidence: number; modelInfo: string }> {
  const fullText = ocrPayload.pages.map((p) => p.text).join('\n\n');

  const systemPrompt = `You are an expert invoice data extractor. Extract structured data from document text.
Always respond with valid JSON only, no markdown or explanations.
Use null for fields that cannot be determined.
Dates should be in YYYY-MM-DD format.
Amounts should be numbers (not strings).
Currency codes should be ISO 4217 (e.g., EUR, USD).
VAT rates should be decimals (e.g., 0.20 for 20%).`;

  const userPrompt = `Extract the following data from this document:
- documentType: classify as "invoice", "receipt", "statement", or "other"
- invoiceNumber
- issueDate (YYYY-MM-DD)
- dueDate (YYYY-MM-DD)
- vendorName, vendorAddress, vendorVatId
- buyerName, buyerAddress, buyerVatId
- currency (default: ${baseCurrency})
- subtotal, vatTotal, total (as numbers)
- lineItems: array with description, quantity, unitPrice, vatRate, lineTotal

Document locale context: ${locale}

Document text:
${fullText}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content);
      const validated = invoiceSchema.parse(parsed);

      // Calculate confidence
      const confidence = calculateConfidence(validated);

      return {
        extraction: validated,
        confidence,
        modelInfo: `openai/${response.model}`,
      };
    } catch (error) {
      lastError = error as Error;
      console.error(`Extraction attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError || new Error('Extraction failed after retries');
}

function calculateConfidence(extraction: InvoiceExtraction): number {
  const requiredFields = ['vendorName', 'total', 'currency'] as const;
  const optionalFields = [
    'invoiceNumber',
    'issueDate',
    'dueDate',
    'subtotal',
    'vatTotal',
  ] as const;

  let score = 0;
  const maxScore = requiredFields.length * 20 + optionalFields.length * 10 + 10;

  for (const field of requiredFields) {
    if (extraction[field]) score += 20;
  }

  for (const field of optionalFields) {
    if (extraction[field]) score += 10;
  }

  if (extraction.lineItems.length > 0) score += 10;

  return Math.min(Math.round((score / maxScore) * 100), 100);
}

// Transaction categorization
const categorySchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
});

export type CategorySuggestion = z.infer<typeof categorySchema>;

export async function categorizeTransaction(
  description: string,
  amount: number,
  categories: Array<{ id: string; name: string; type: string }>
): Promise<CategorySuggestion> {
  const categoryList = categories.map((c) => `- ${c.id}: ${c.name} (${c.type})`).join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a financial transaction categorizer. Categorize transactions based on their description.
Always respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: `Categorize this transaction:
Description: ${description}
Amount: ${amount >= 0 ? '+' : ''}${amount}

Available categories:
${categoryList}

Respond with JSON containing: categoryId, categoryName, confidence (0-100), reasoning`,
      },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  return categorySchema.parse(JSON.parse(content));
}

// Chat with context
export async function chatWithContext(
  question: string,
  context: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{
  answer: string;
  citations: Array<{ type: string; id: string; reason: string }>;
  followUps: string[];
}> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a helpful AI accounting assistant. Answer questions about financial data.
Always cite specific invoices, transactions, or documents when relevant.
Provide 2-3 follow-up question suggestions.
Respond with JSON containing: answer (markdown), citations (array of {type, id, reason}), followUps (array of strings)`,
      },
      {
        role: 'user',
        content: `Financial context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  return JSON.parse(content);
}
