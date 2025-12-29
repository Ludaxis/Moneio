/**
 * POST /api/transactions/normalize-headers
 *
 * Normalize CSV headers using AI to detect column types
 * Supports any language - translates to standard English names
 */

import { CsvHeaderNormalizer, createOpenAiClient } from '@moneio/ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  headers: z.array(z.string()).min(1).max(50),
  sampleRows: z.array(z.array(z.string())).max(5).optional(),
});

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      // Return empty mappings - let frontend use fallback detection
      return NextResponse.json({
        mappings: [],
        error: 'AI not configured',
      });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { headers, sampleRows } = parsed.data;

    // Create AI client and normalizer
    const llmClient = createOpenAiClient({
      model: 'gpt-4o-mini', // Fast and cheap for simple classification
    });

    const normalizer = new CsvHeaderNormalizer(llmClient);
    const result = await normalizer.normalizeHeaders(headers, sampleRows);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to normalize CSV headers:', error);
    return NextResponse.json(
      { error: 'Failed to normalize headers', mappings: [] },
      { status: 500 }
    );
  }
}
