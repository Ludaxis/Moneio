// Chat adapter for financial Q&A
import type { ChatCitation, ChatMessage, ChatResponse } from '@moneio/domain';

import type { LlmClient } from '../extraction/invoice-extractor.js';
import type { WorkspaceContext } from '../types.js';

import type { RagService, RetrievedDocument } from './rag-service.js';

export interface ChatAdapter {
  answer(
    question: string,
    context: WorkspaceContext,
    conversationHistory?: ChatMessage[]
  ): Promise<ChatResponse>;
}

export interface FinancialDataContext {
  recentTransactions?: Array<{
    date: string;
    description: string;
    amount: number;
    category?: string;
  }>;
  invoiceSummary?: {
    totalPending: number;
    totalPaid: number;
    count: number;
  };
  cashflowSummary?: {
    income: number;
    expenses: number;
    net: number;
    period: string;
  };
}

export class FinancialChatAdapter implements ChatAdapter {
  constructor(
    private readonly llm: LlmClient,
    private readonly ragService: RagService
  ) {}

  async answer(
    question: string,
    context: WorkspaceContext,
    conversationHistory?: ChatMessage[]
  ): Promise<ChatResponse> {
    // Retrieve relevant documents
    const retrievedDocs = await this.ragService.retrieve(question, context.workspaceId, 5);

    // Build prompt with context
    const prompt = this.buildPrompt(question, context, retrievedDocs, conversationHistory);

    // Get response from LLM
    const response = await this.llm.complete(prompt);

    // Parse response and extract citations
    const { answer, citations, followUps } = this.parseResponse(response, retrievedDocs);

    return {
      conversationId: crypto.randomUUID(),
      message: {
        role: 'assistant',
        content: answer,
        citations,
      },
      followUpQuestions: followUps,
    };
  }

  private buildPrompt(
    question: string,
    context: WorkspaceContext,
    retrievedDocs: RetrievedDocument[],
    conversationHistory?: ChatMessage[]
  ): string {
    const docsContext = retrievedDocs
      .map(
        (doc, i) =>
          `[Document ${i + 1}] Type: ${doc.type}, Date: ${doc.date || 'Unknown'}
${doc.content}`
      )
      .join('\n\n');

    const historyContext =
      conversationHistory
        ?.slice(-5) // Last 5 messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n') || '';

    return `You are a helpful financial assistant for a small business accounting application.
Answer questions about the user's financial data based on the provided context.

Workspace Context:
- Currency: ${context.baseCurrency}
- Locale: ${context.locale}

Relevant Documents and Data:
${docsContext || 'No specific documents found.'}

${historyContext ? `Conversation History:\n${historyContext}\n` : ''}

User Question: ${question}

Instructions:
1. Answer the question based on the provided context
2. If you reference specific documents or transactions, cite them as [Doc N]
3. If you cannot answer from the provided context, say so clearly
4. Suggest 2-3 relevant follow-up questions
5. Format numbers appropriately for the locale

Respond in JSON format:
{
  "answer": "Your detailed answer here with [Doc N] citations",
  "citations": [1, 2, ...], // Document numbers referenced
  "followUpQuestions": ["Question 1?", "Question 2?", ...]
}`;
  }

  private parseResponse(
    response: string,
    retrievedDocs: RetrievedDocument[]
  ): {
    answer: string;
    citations: ChatCitation[];
    followUps: string[];
  } {
    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      const parsed = JSON.parse(jsonStr.trim());

      // Build citations from referenced documents
      const citations: ChatCitation[] = (parsed.citations || [])
        .filter((idx: number) => retrievedDocs[idx - 1])
        .map((idx: number) => {
          const doc = retrievedDocs[idx - 1];
          return {
            type: doc.type,
            id: doc.id,
            title: doc.title || `${doc.type} - ${doc.date}`,
            snippet: doc.content.substring(0, 200),
          };
        });

      return {
        answer: parsed.answer || response,
        citations,
        followUps: parsed.followUpQuestions || [],
      };
    } catch {
      return {
        answer: response,
        citations: [],
        followUps: [],
      };
    }
  }
}

// Predefined response templates for common questions
export const COMMON_QUESTION_PATTERNS = [
  {
    patterns: [/spend.*last\s+month/i, /how much.*spent/i],
    type: 'spending_summary',
  },
  {
    patterns: [/cash\s*flow/i, /money\s+in.*out/i],
    type: 'cashflow',
  },
  {
    patterns: [/pending\s+invoice/i, /unpaid\s+invoice/i],
    type: 'pending_invoices',
  },
  {
    patterns: [/vat|tax\s+summary/i],
    type: 'vat_summary',
  },
  {
    patterns: [/top\s+merchant|biggest\s+expense/i],
    type: 'top_merchants',
  },
];
