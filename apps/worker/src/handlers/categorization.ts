import { TransactionCategorizer, HeuristicCategorizer } from '@moneio/ai';
import { createOpenAiClient } from '@moneio/ai';
import { prisma } from '@moneio/db';
import { Job } from 'bullmq';

import type { CategorizationJobData, CategorizationResult } from '../lib/queues';

/**
 * CATEGORIZATION handler
 *
 * Suggest categories for bank transactions using AI
 * - Fetch transaction details
 * - Get workspace categories
 * - Call LLM (with heuristic fallback) for categorization
 * - Store as AI suggestions (pending, reviewable)
 */
export async function handleCategorization(
  job: Job<CategorizationJobData>
): Promise<CategorizationResult> {
  const { workspaceId, transactionIds } = job.data;

  console.log(`[CATEGORIZATION] Processing ${transactionIds.length} transactions`);

  try {
    await job.updateProgress(10);

    // Get transactions with minimal fields
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        id: { in: transactionIds },
        workspaceId,
      },
    });

    if (transactions.length === 0) {
      return { success: true, categorized: 0, suggestions: [] };
    }

    await job.updateProgress(25);

    // Get categories for the workspace
    const categories = await prisma.category.findMany({
      where: { workspaceId },
    });

    await job.updateProgress(40);

    // Build context
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { locale: true },
    });

    const context = {
      workspaceId,
      locale: workspace?.locale || 'en',
      merchantNames: [] as string[],
    };

    // Decide AI vs heuristic
    const llmConfigured = !!process.env.OPENAI_API_KEY;
    const client = llmConfigured ? createOpenAiClient({ model: 'gpt-4o-mini' }) : null;
    const categorizer = llmConfigured
      ? new TransactionCategorizer(client!)
      : new HeuristicCategorizer();

    const suggestions: CategorizationResult['suggestions'] = [];

    // Process sequentially to avoid hammering rate limits
    for (const tx of transactions) {
      // Extract reference from rawData if available
      const rawData = tx.rawData as { reference?: string } | null;
      const reference = rawData?.reference;

      const bankTx = {
        id: tx.id,
        descriptionRaw: tx.description || reference || '',
        amount: {
          amount: Math.round(Number(tx.amount) * 100),
          currency: tx.currency,
        },
        counterparty: undefined as string | undefined,
        reference: reference || undefined,
        postedAt: tx.postedAt.toISOString(),
      };

      const proposal = await categorizer.categorizeTransaction(
        bankTx as any,
        categories as any,
        context as any
      );

      // Clean up existing pending suggestions for this tx to avoid duplicates
      await prisma.aiSuggestion.deleteMany({
        where: {
          workspaceId,
          targetId: tx.id,
          suggestionType: 'categorization',
        },
      });

      await prisma.aiSuggestion.create({
        data: {
          workspaceId,
          suggestionType: 'categorization',
          targetId: tx.id,
          payloadJson: JSON.parse(
            JSON.stringify({
              categoryId: proposal.data.categoryId,
              categoryName: proposal.data.categoryName,
              targetType: 'bank_transaction',
              reason: proposal.data.reasoning,
              modelInfo: proposal.modelInfo,
            })
          ),
          confidence: proposal.confidence / 100,
          status: 'pending',
        },
      });

      suggestions.push({
        transactionId: tx.id,
        categoryId: proposal.data.categoryId,
        confidence: proposal.confidence / 100,
      });
    }

    await job.updateProgress(100);

    console.log(`[CATEGORIZATION] Created ${suggestions.length} suggestions`);

    return {
      success: true,
      categorized: suggestions.length,
      suggestions,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CATEGORIZATION] Failed:`, errorMessage);

    return {
      success: false,
      categorized: 0,
      suggestions: [],
      error: errorMessage,
    };
  }
}
