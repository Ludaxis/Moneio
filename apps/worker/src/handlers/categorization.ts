import { TransactionCategorizer, HeuristicCategorizer, createLlmClient } from '@moneio/ai';
import { prisma } from '@moneio/db';
import { findMatchingRuleForPrismaTransaction } from '@moneio/domain';
import { Job } from 'bullmq';

import type { CategorizationJobData, CategorizationResult } from '../lib/queues';

/**
 * CATEGORIZATION handler
 *
 * Suggest categories for bank transactions using rules + AI
 * Priority: Rules (deterministic) → AI (with heuristic fallback)
 *
 * - Fetch transaction details
 * - Get workspace rules (sorted by priority)
 * - Apply rules first (100% confidence, instant)
 * - For unmatched: call LLM or heuristic
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

    await job.updateProgress(20);

    // Get categories for the workspace
    const categories = await prisma.category.findMany({
      where: { workspaceId },
    });

    // Get active rules for the workspace, sorted by priority (highest first)
    const rules = await prisma.rule.findMany({
      where: {
        workspaceId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    await job.updateProgress(30);

    // Build context for AI
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { locale: true },
    });

    const context = {
      workspaceId,
      locale: workspace?.locale || 'en',
      merchantNames: [] as string[],
    };

    // Decide AI vs heuristic - check for either Gemini or OpenAI
    const llmConfigured =
      !!process.env.GEMINI_API_KEY ||
      !!process.env.GOOGLE_AI_API_KEY ||
      !!process.env.OPENAI_API_KEY;
    const client = llmConfigured ? createLlmClient() : null;
    const categorizer = llmConfigured
      ? new TransactionCategorizer(client!)
      : new HeuristicCategorizer();

    const suggestions: CategorizationResult['suggestions'] = [];
    let ruleMatches = 0;
    let aiMatches = 0;

    // Process each transaction
    for (const tx of transactions) {
      // Clean up existing pending suggestions for this tx to avoid duplicates
      await prisma.aiSuggestion.deleteMany({
        where: {
          workspaceId,
          targetId: tx.id,
          suggestionType: 'categorization',
        },
      });

      // STEP 1: Try rules first (fast, deterministic, 100% confidence)
      const matchedRule = findMatchingRuleForPrismaTransaction(rules, {
        description: tx.description,
        amount: tx.amount,
        rawData: tx.rawData,
      });

      if (matchedRule) {
        // Get category name for the matched rule
        const category = categories.find((c) => c.id === matchedRule.categoryId);

        await prisma.aiSuggestion.create({
          data: {
            workspaceId,
            suggestionType: 'categorization',
            targetId: tx.id,
            payloadJson: JSON.parse(
              JSON.stringify({
                categoryId: matchedRule.categoryId,
                categoryName: category?.name || 'Unknown',
                targetType: 'bank_transaction',
                reason: `Matched rule: ${matchedRule.name}`,
                source: 'rule',
                ruleId: matchedRule.id,
              })
            ),
            confidence: 1.0, // 100% confidence for rule matches
            status: 'pending',
          },
        });

        suggestions.push({
          transactionId: tx.id,
          categoryId: matchedRule.categoryId,
          confidence: 1.0,
        });

        ruleMatches++;
        continue;
      }

      // STEP 2: No rule matched - use AI or heuristic
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
              source: llmConfigured ? 'ai' : 'heuristic',
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

      aiMatches++;
    }

    await job.updateProgress(100);

    console.log(
      `[CATEGORIZATION] Created ${suggestions.length} suggestions ` +
        `(${ruleMatches} from rules, ${aiMatches} from AI/heuristic)`
    );

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
