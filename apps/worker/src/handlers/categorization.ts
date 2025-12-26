import { Job } from 'bullmq';
import { prisma } from '@moneio/db';

import type { CategorizationJobData, CategorizationResult } from '../lib/queues';

/**
 * CATEGORIZATION handler
 *
 * Suggest categories for bank transactions using AI
 * - Fetch transaction details
 * - Get workspace categories
 * - Call LLM for categorization suggestions
 * - Store as AI suggestions (not auto-applied)
 */
export async function handleCategorization(
  job: Job<CategorizationJobData>
): Promise<CategorizationResult> {
  const { workspaceId, transactionIds } = job.data;

  console.log(`[CATEGORIZATION] Processing ${transactionIds.length} transactions`);

  try {
    await job.updateProgress(10);

    // Get transactions
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        id: { in: transactionIds },
        workspaceId,
      },
    });

    if (transactions.length === 0) {
      return {
        success: true,
        categorized: 0,
        suggestions: [],
      };
    }

    await job.updateProgress(30);

    // Get categories for the workspace
    const categories = await prisma.category.findMany({
      where: { workspaceId },
    });

    await job.updateProgress(50);

    // TODO: Implement actual categorization in T18
    // - Build prompt with transaction details
    // - Call OpenAI for categorization
    // - Create AI suggestions

    const suggestions: CategorizationResult['suggestions'] = [];

    // For now, create stub suggestions
    for (const tx of transactions) {
      // Simple heuristic for demo
      const suggestedCategory = categories.find((c) => {
        const desc = (tx.description || '').toLowerCase();
        const name = c.name.toLowerCase();
        return desc.includes(name) || name.includes('general');
      });

      if (suggestedCategory) {
        await prisma.aiSuggestion.create({
          data: {
            workspaceId,
            suggestionType: 'categorization',
            entityType: 'bank_transaction',
            entityId: tx.id,
            payloadJson: {
              categoryId: suggestedCategory.id,
              categoryName: suggestedCategory.name,
              reason: 'Heuristic match (AI categorization pending)',
            },
            confidence: 0.5,
            status: 'pending',
          },
        });

        suggestions.push({
          transactionId: tx.id,
          categoryId: suggestedCategory.id,
          confidence: 0.5,
        });
      }
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
