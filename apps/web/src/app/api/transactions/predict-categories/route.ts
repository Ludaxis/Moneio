/**
 * Transaction Category Prediction API
 *
 * POST /api/transactions/predict-categories
 * Predict categories for transactions during import preview (before saving)
 */

import { TransactionCategorizer, HeuristicCategorizer, createLlmClient } from '@moneio/ai';
import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const transactionSchema = z.object({
  id: z.string(), // temporary ID from import preview
  description: z.string(),
  amount: z.number(),
  date: z.string().optional(),
});

const predictSchema = z.object({
  workspaceId: z.string().uuid(),
  transactions: z.array(transactionSchema).min(1).max(100), // Limit to 100 for performance
});

interface PredictionResult {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  reasoning?: string;
}

/**
 * POST /api/transactions/predict-categories
 * Predict categories for a batch of transactions
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = predictSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, transactions } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get categories for the workspace
    const categories = await prisma.category.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    });

    if (categories.length === 0) {
      // No categories defined, return empty predictions
      const predictions: PredictionResult[] = transactions.map((tx) => ({
        id: tx.id,
        categoryId: null,
        categoryName: null,
        confidence: 0,
      }));
      return NextResponse.json({ predictions });
    }

    // Get workspace context
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { locale: true },
    });

    const context = {
      workspaceId,
      locale: workspace?.locale || 'en',
      merchantNames: [] as string[],
    };

    // Check if LLM is configured
    const llmConfigured =
      !!process.env.GEMINI_API_KEY ||
      !!process.env.GOOGLE_AI_API_KEY ||
      !!process.env.OPENAI_API_KEY;

    const client = llmConfigured ? createLlmClient() : null;
    const categorizer = llmConfigured
      ? new TransactionCategorizer(client!)
      : new HeuristicCategorizer();

    const predictions: PredictionResult[] = [];

    // Process transactions - limit concurrency to avoid rate limits
    for (const tx of transactions) {
      try {
        const bankTx = {
          id: tx.id,
          descriptionRaw: tx.description || '',
          amount: {
            amount: Math.round(tx.amount * 100),
            currency: 'EUR', // Default, could be passed from frontend
          },
          counterparty: undefined as string | undefined,
          reference: undefined as string | undefined,
          postedAt: tx.date || new Date().toISOString(),
        };

        const proposal = await categorizer.categorizeTransaction(
          bankTx as Parameters<typeof categorizer.categorizeTransaction>[0],
          categories as Parameters<typeof categorizer.categorizeTransaction>[1],
          context as Parameters<typeof categorizer.categorizeTransaction>[2]
        );

        predictions.push({
          id: tx.id,
          categoryId: proposal.data.categoryId,
          categoryName: proposal.data.categoryName,
          confidence: proposal.confidence,
          reasoning: proposal.data.reasoning,
        });
      } catch (error) {
        console.error(`Failed to predict category for ${tx.id}:`, error);
        predictions.push({
          id: tx.id,
          categoryId: null,
          categoryName: null,
          confidence: 0,
        });
      }
    }

    return NextResponse.json({ predictions });
  } catch (error) {
    console.error('Failed to predict categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
