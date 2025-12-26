import type { Job } from 'bullmq';
import { categorizeTransaction } from '../services/openai.js';

export interface CategorizationJob {
  transactionIds: string[];
  workspaceId: string;
}

export interface CategorizationResult {
  processed: number;
  categorized: number;
  suggestions: Array<{
    transactionId: string;
    categoryId: string;
    categoryName: string;
    confidence: number;
    reasoning: string;
  }>;
}

export async function processCategorization(
  job: Job<CategorizationJob>
): Promise<CategorizationResult> {
  const { transactionIds, workspaceId } = job.data;

  console.log(
    `[CATEGORIZATION] Processing ${transactionIds.length} transactions for workspace ${workspaceId}`
  );

  // TODO: Fetch transactions and categories from database
  // const transactions = await getTransactions(transactionIds);
  // const categories = await getCategories(workspaceId);

  // Placeholder categories
  const categories = [
    { id: 'cat-1', name: 'Office Supplies', type: 'expense' },
    { id: 'cat-2', name: 'Software', type: 'expense' },
    { id: 'cat-3', name: 'Travel', type: 'expense' },
    { id: 'cat-4', name: 'Utilities', type: 'expense' },
    { id: 'cat-5', name: 'Sales', type: 'income' },
  ];

  const suggestions: CategorizationResult['suggestions'] = [];

  // Process each transaction
  for (let i = 0; i < transactionIds.length; i++) {
    const transactionId = transactionIds[i];

    await job.updateProgress(Math.round((i / transactionIds.length) * 100));

    try {
      // TODO: Get actual transaction data
      const description = 'Placeholder description';
      const amount = -100;

      const suggestion = await categorizeTransaction(description, amount, categories);

      suggestions.push({
        transactionId,
        ...suggestion,
      });
    } catch (error) {
      console.error(`Failed to categorize transaction ${transactionId}:`, error);
    }
  }

  await job.updateProgress(100);

  console.log(
    `[CATEGORIZATION] Processed ${transactionIds.length}, categorized ${suggestions.length}`
  );

  return {
    processed: transactionIds.length,
    categorized: suggestions.length,
    suggestions,
  };
}
