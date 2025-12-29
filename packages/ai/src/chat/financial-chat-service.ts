/**
 * Financial Chat Service
 *
 * Handles natural language queries about financial data.
 * Uses pattern recognition to map questions to database queries.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  formatPeriod,
  getPeriodDateRange,
  parseQuery,
  type ParsedQuery,
  type QueryType,
} from './query-patterns';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  FinancialContext,
  QueryResult,
} from './types';

/**
 * Financial data provider interface
 * Implemented by the API layer with actual database access
 */
export interface FinancialDataProvider {
  getSpendingByMerchant(
    workspaceId: string,
    merchant: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ total: number; count: number; currency: string }>;

  getSpendingByCategory(
    workspaceId: string,
    category: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ total: number; count: number; currency: string }>;

  getTotalSpending(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ total: number; currency: string; breakdown: CategoryBreakdown[] }>;

  getTotalIncome(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ total: number; currency: string; sources: IncomeSource[] }>;

  getCashflow(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ income: number; expenses: number; net: number; currency: string }>;

  getLargestExpenses(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    limit: number
  ): Promise<{ expenses: Expense[]; currency: string }>;

  getRecurringExpenses(
    workspaceId: string
  ): Promise<{ patterns: RecurringPattern[]; monthlyTotal: number; currency: string }>;

  getRunway(workspaceId: string): Promise<RunwayData>;

  getPendingInvoices(
    workspaceId: string
  ): Promise<{ invoices: PendingInvoice[]; totalAmount: number; currency: string }>;

  getCategoryBreakdown(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ categories: CategoryBreakdown[]; currency: string }>;
}

interface CategoryBreakdown {
  name: string;
  amount: number;
  percentage: number;
}

interface IncomeSource {
  name: string;
  amount: number;
  percentage: number;
}

interface Expense {
  description: string;
  amount: number;
  date: string;
  category?: string;
}

interface RecurringPattern {
  merchant: string;
  amount: number;
  frequency: string;
  nextExpected: string;
}

interface RunwayData {
  monthsRemaining: number;
  currentCash: number;
  monthlyBurnRate: number;
  status: 'critical' | 'warning' | 'healthy' | 'excellent';
  description: string;
  currency: string;
}

interface PendingInvoice {
  number: string;
  merchant: string;
  amount: number;
  dueDate: string;
  daysOverdue?: number;
}

/**
 * Financial Chat Service
 */
export class FinancialChatService {
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor(private readonly dataProvider: FinancialDataProvider) {}

  /**
   * Process a chat message and return a response
   */
  async chat(request: ChatRequest, context: FinancialContext): Promise<ChatResponse> {
    const conversationId = request.conversationId || uuidv4();

    // Parse the question
    const parsedQuery = parseQuery(request.message);

    // Execute the appropriate query
    const result = await this.executeQuery(parsedQuery, context);

    // Generate response
    const responseContent = this.generateResponse(parsedQuery, result, context);

    // Create response message
    const responseMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: responseContent,
      timestamp: new Date(),
      metadata: {
        queryType: parsedQuery.type,
        period: parsedQuery.period,
        confidence: parsedQuery.confidence,
        suggestions: this.getSuggestions(parsedQuery.type),
      },
    };

    // Store in conversation history
    this.addToHistory(conversationId, {
      id: uuidv4(),
      role: 'user',
      content: request.message,
      timestamp: new Date(),
    });
    this.addToHistory(conversationId, responseMessage);

    return {
      message: responseMessage,
      conversationId,
    };
  }

  /**
   * Execute query based on parsed type
   */
  private async executeQuery(
    parsed: ParsedQuery,
    context: FinancialContext
  ): Promise<QueryResult> {
    const period = parsed.period || 'this_month';
    const { startDate, endDate } = getPeriodDateRange(period);

    try {
      switch (parsed.type) {
        case 'spending_by_merchant':
          if (!parsed.merchant) {
            return { success: false, error: 'Could not identify merchant name' };
          }
          return {
            success: true,
            data: await this.dataProvider.getSpendingByMerchant(
              context.workspaceId,
              parsed.merchant,
              startDate,
              endDate
            ),
          };

        case 'spending_by_category':
          if (!parsed.category) {
            return { success: false, error: 'Could not identify category' };
          }
          return {
            success: true,
            data: await this.dataProvider.getSpendingByCategory(
              context.workspaceId,
              parsed.category,
              startDate,
              endDate
            ),
          };

        case 'total_spending':
          return {
            success: true,
            data: await this.dataProvider.getTotalSpending(
              context.workspaceId,
              startDate,
              endDate
            ),
          };

        case 'total_income':
          return {
            success: true,
            data: await this.dataProvider.getTotalIncome(
              context.workspaceId,
              startDate,
              endDate
            ),
          };

        case 'cashflow':
          return {
            success: true,
            data: await this.dataProvider.getCashflow(context.workspaceId, startDate, endDate),
          };

        case 'largest_expenses':
          return {
            success: true,
            data: await this.dataProvider.getLargestExpenses(
              context.workspaceId,
              startDate,
              endDate,
              parsed.limit || 10
            ),
          };

        case 'recurring_expenses':
          return {
            success: true,
            data: await this.dataProvider.getRecurringExpenses(context.workspaceId),
          };

        case 'runway':
          return {
            success: true,
            data: await this.dataProvider.getRunway(context.workspaceId),
          };

        case 'profitable': {
          const cashflow = await this.dataProvider.getCashflow(
            context.workspaceId,
            startDate,
            endDate
          );
          return {
            success: true,
            data: {
              ...cashflow,
              isProfitable: cashflow.net > 0,
              period: formatPeriod(period),
            },
          };
        }

        case 'pending_invoices':
          return {
            success: true,
            data: await this.dataProvider.getPendingInvoices(context.workspaceId),
          };

        case 'category_breakdown':
          return {
            success: true,
            data: await this.dataProvider.getCategoryBreakdown(
              context.workspaceId,
              startDate,
              endDate
            ),
          };

        case 'unknown':
        default:
          return {
            success: false,
            error: 'not_understood',
            suggestions: [
              'How much did I spend this month?',
              'What is my runway?',
              'Show my recurring expenses',
              'Where is my money going?',
            ],
          };
      }
    } catch (error) {
      console.error('Query execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      };
    }
  }

  /**
   * Generate natural language response from query result
   */
  private generateResponse(
    parsed: ParsedQuery,
    result: QueryResult,
    _context: FinancialContext
  ): string {
    if (!result.success) {
      if (result.error === 'not_understood') {
        return (
          "I'm not sure I understand that question. Here are some things you can ask me:\n\n" +
          "- How much did I spend this month?\n" +
          "- What's my cash runway?\n" +
          "- Show my recurring expenses\n" +
          "- What are my biggest expenses?\n" +
          "- Am I profitable?"
        );
      }
      return `Sorry, I couldn't get that information: ${result.error}`;
    }

    const period = formatPeriod(parsed.period || 'this_month');
    const data = result.data as Record<string, unknown>;

    switch (parsed.type) {
      case 'spending_by_merchant':
        return this.formatMerchantSpending(parsed.merchant!, data, period);

      case 'spending_by_category':
        return this.formatCategorySpending(parsed.category!, data, period);

      case 'total_spending':
        return this.formatTotalSpending(data, period);

      case 'total_income':
        return this.formatTotalIncome(data, period);

      case 'cashflow':
        return this.formatCashflow(data, period);

      case 'largest_expenses':
        return this.formatLargestExpenses(data, period, parsed.limit || 10);

      case 'recurring_expenses':
        return this.formatRecurringExpenses(data);

      case 'runway':
        return this.formatRunway(data);

      case 'profitable':
        return this.formatProfitability(data);

      case 'pending_invoices':
        return this.formatPendingInvoices(data);

      case 'category_breakdown':
        return this.formatCategoryBreakdown(data, period);

      default:
        return "I found some data but I'm not sure how to present it. Can you rephrase your question?";
    }
  }

  private formatMerchantSpending(
    merchant: string,
    data: Record<string, unknown>,
    period: string
  ): string {
    const total = data.total as number;
    const count = data.count as number;
    const currency = data.currency as string;

    if (total === 0) {
      return `I don't see any spending at ${merchant} ${period}.`;
    }

    return (
      `You spent **${this.formatCurrency(total, currency)}** at ${merchant} ${period}.\n\n` +
      `That's across ${count} transaction${count === 1 ? '' : 's'}.`
    );
  }

  private formatCategorySpending(
    category: string,
    data: Record<string, unknown>,
    period: string
  ): string {
    const total = data.total as number;
    const currency = data.currency as string;

    if (total === 0) {
      return `No spending in the ${category} category ${period}.`;
    }

    return `You spent **${this.formatCurrency(total, currency)}** on ${category} ${period}.`;
  }

  private formatTotalSpending(data: Record<string, unknown>, period: string): string {
    const total = data.total as number;
    const currency = data.currency as string;
    const breakdown = data.breakdown as CategoryBreakdown[] | undefined;

    let response = `Your total spending ${period} is **${this.formatCurrency(total, currency)}**.`;

    if (breakdown && breakdown.length > 0) {
      response += '\n\nTop categories:\n';
      breakdown.slice(0, 5).forEach((cat) => {
        response += `- ${cat.name}: ${this.formatCurrency(cat.amount, currency)} (${cat.percentage.toFixed(0)}%)\n`;
      });
    }

    return response;
  }

  private formatTotalIncome(data: Record<string, unknown>, period: string): string {
    const total = data.total as number;
    const currency = data.currency as string;

    return `Your total income ${period} is **${this.formatCurrency(total, currency)}**.`;
  }

  private formatCashflow(data: Record<string, unknown>, period: string): string {
    const income = data.income as number;
    const expenses = data.expenses as number;
    const net = data.net as number;
    const currency = data.currency as string;

    const status = net > 0 ? 'positive' : net < 0 ? 'negative' : 'break-even';

    return (
      `**Cashflow ${period}:**\n\n` +
      `- Income: ${this.formatCurrency(income, currency)}\n` +
      `- Expenses: ${this.formatCurrency(expenses, currency)}\n` +
      `- Net: **${this.formatCurrency(net, currency)}** (${status})`
    );
  }

  private formatLargestExpenses(
    data: Record<string, unknown>,
    period: string,
    limit: number
  ): string {
    const expenses = data.expenses as Expense[];
    const currency = data.currency as string;

    if (!expenses || expenses.length === 0) {
      return `No expenses found ${period}.`;
    }

    let response = `**Top ${Math.min(limit, expenses.length)} expenses ${period}:**\n\n`;
    expenses.slice(0, limit).forEach((exp, i) => {
      response += `${i + 1}. ${exp.description}: ${this.formatCurrency(exp.amount, currency)}`;
      if (exp.category) {
        response += ` (${exp.category})`;
      }
      response += '\n';
    });

    return response;
  }

  private formatRecurringExpenses(data: Record<string, unknown>): string {
    const patterns = data.patterns as RecurringPattern[];
    const monthlyTotal = data.monthlyTotal as number;
    const currency = data.currency as string;

    if (!patterns || patterns.length === 0) {
      return "I haven't detected any recurring expenses yet. This analysis improves as more transaction data is available.";
    }

    let response =
      `**Recurring Expenses:** ${this.formatCurrency(monthlyTotal, currency)}/month\n\n`;
    patterns.slice(0, 10).forEach((p) => {
      response += `- ${p.merchant}: ${this.formatCurrency(p.amount, currency)}/${p.frequency}\n`;
    });

    if (patterns.length > 10) {
      response += `\n...and ${patterns.length - 10} more`;
    }

    return response;
  }

  private formatRunway(data: Record<string, unknown>): string {
    const runway = data as unknown as RunwayData;

    if (runway.monthsRemaining === Infinity) {
      return (
        "**Great news!** Your business is profitable, which means you have unlimited runway. " +
        'You\'re earning more than you\'re spending.'
      );
    }

    let response = `**Cash Runway:** ${runway.monthsRemaining} months\n\n`;
    response += `- Current cash: ${this.formatCurrency(runway.currentCash, runway.currency)}\n`;
    response += `- Monthly burn rate: ${this.formatCurrency(runway.monthlyBurnRate, runway.currency)}\n\n`;
    response += runway.description;

    return response;
  }

  private formatProfitability(data: Record<string, unknown>): string {
    const isProfitable = data.isProfitable as boolean;
    const net = data.net as number;
    const currency = data.currency as string;
    const period = data.period as string;

    if (isProfitable) {
      return (
        `**Yes, you're profitable ${period}!**\n\n` +
        `Net income: ${this.formatCurrency(net, currency)}`
      );
    } else {
      return (
        `**Not quite ${period}.**\n\n` +
        `Net loss: ${this.formatCurrency(Math.abs(net), currency)}\n\n` +
        "Consider reviewing your expenses or increasing revenue."
      );
    }
  }

  private formatPendingInvoices(data: Record<string, unknown>): string {
    const invoices = data.invoices as PendingInvoice[];
    const totalAmount = data.totalAmount as number;
    const currency = data.currency as string;

    if (!invoices || invoices.length === 0) {
      return 'No pending invoices. All caught up!';
    }

    let response =
      `**${invoices.length} Pending Invoice${invoices.length === 1 ? '' : 's'}:** ` +
      `${this.formatCurrency(totalAmount, currency)} total\n\n`;

    invoices.slice(0, 5).forEach((inv) => {
      response += `- ${inv.number}: ${this.formatCurrency(inv.amount, currency)} from ${inv.merchant}`;
      if (inv.daysOverdue && inv.daysOverdue > 0) {
        response += ` (${inv.daysOverdue} days overdue)`;
      }
      response += '\n';
    });

    if (invoices.length > 5) {
      response += `\n...and ${invoices.length - 5} more`;
    }

    return response;
  }

  private formatCategoryBreakdown(data: Record<string, unknown>, period: string): string {
    const categories = data.categories as CategoryBreakdown[];
    const currency = data.currency as string;

    if (!categories || categories.length === 0) {
      return `No spending data available ${period}.`;
    }

    let response = `**Where your money went ${period}:**\n\n`;
    categories.forEach((cat) => {
      response += `- ${cat.name}: ${this.formatCurrency(cat.amount, currency)} (${cat.percentage.toFixed(0)}%)\n`;
    });

    return response;
  }

  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Get follow-up suggestions based on query type
   */
  private getSuggestions(queryType: QueryType): string[] {
    const suggestions: Record<QueryType, string[]> = {
      spending_by_merchant: [
        'What are my recurring expenses?',
        'Show my biggest expenses',
        'Where is my money going?',
      ],
      spending_by_category: [
        'What is my total spending?',
        'Am I profitable?',
        'Show category breakdown',
      ],
      total_spending: [
        'Where is my money going?',
        'What are my biggest expenses?',
        'What is my income?',
      ],
      total_income: ['Am I profitable?', 'What is my cashflow?', 'What is my runway?'],
      cashflow: ['Am I profitable?', 'What is my runway?', 'Show recurring expenses'],
      largest_expenses: [
        'Show my recurring expenses',
        'Where is my money going?',
        'Am I profitable?',
      ],
      recurring_expenses: [
        'What is my runway?',
        'What are my biggest expenses?',
        'Show category breakdown',
      ],
      runway: [
        'Am I profitable?',
        'What are my recurring expenses?',
        'Show my cashflow',
      ],
      profitable: ['What is my runway?', 'Show my cashflow', 'Where is my money going?'],
      pending_invoices: ['What is my income?', 'Am I profitable?', 'What is my cashflow?'],
      category_breakdown: [
        'What are my biggest expenses?',
        'Show recurring expenses',
        'Am I profitable?',
      ],
      unknown: [
        'How much did I spend this month?',
        'What is my runway?',
        'Show my recurring expenses',
        'Am I profitable?',
      ],
    };

    return suggestions[queryType] || suggestions.unknown;
  }

  /**
   * Add message to conversation history
   */
  private addToHistory(conversationId: string, message: ChatMessage): void {
    const history = this.conversationHistory.get(conversationId) || [];
    history.push(message);
    // Keep last 20 messages
    if (history.length > 20) {
      history.shift();
    }
    this.conversationHistory.set(conversationId, history);
  }

  /**
   * Get conversation history
   */
  getHistory(conversationId: string): ChatMessage[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  /**
   * Clear conversation history
   */
  clearHistory(conversationId: string): void {
    this.conversationHistory.delete(conversationId);
  }
}
