/**
 * Financial Chat Service
 *
 * Handles natural language queries about financial data.
 * Uses pattern recognition to map questions to database queries.
 */

import { v4 as uuidv4 } from 'uuid';

import { createLlmClient } from '../clients';

import { classifyQueryWithLlm } from './llm-query-classifier';
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

  // New AI-first methods
  getSubscriptionAnalysis(workspaceId: string): Promise<SubscriptionAnalysisData>;

  getMoneyLeaks(workspaceId: string): Promise<MoneyLeaksData>;

  getSavingsOpportunities(workspaceId: string): Promise<SavingsData>;

  getExpenseComparison(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ExpenseComparisonData>;

  getVendorAnalysis(
    workspaceId: string,
    merchant: string,
    startDate: Date,
    endDate: Date
  ): Promise<VendorAnalysisData>;

  getInvoiceStatus(workspaceId: string): Promise<InvoiceStatusData>;
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

// New AI-first data types
interface SubscriptionAnalysisData {
  subscriptions: Array<{
    name: string;
    amount: number;
    frequency: string;
    monthlyEquivalent: number;
    status: string;
    flags: string[];
  }>;
  totalMonthly: number;
  totalAnnual: number;
  flaggedCount: number;
  currency: string;
}

interface MoneyLeaksData {
  leaks: Array<{
    type: string;
    title: string;
    description: string;
    annualImpact: number;
    recommendation: string;
  }>;
  totalPotentialSavings: number;
  currency: string;
}

interface SavingsData {
  opportunities: Array<{
    title: string;
    description: string;
    potentialSavings: number;
    actionable: boolean;
  }>;
  totalPotentialSavings: number;
  currency: string;
}

interface ExpenseComparisonData {
  currentPeriod: { total: number; periodLabel: string };
  previousPeriod: { total: number; periodLabel: string };
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  anomalies: Array<{ category: string; deviation: number; description: string }>;
  currency: string;
}

interface VendorAnalysisData {
  merchant: string;
  totalSpent: number;
  transactionCount: number;
  averageTransaction: number;
  firstTransaction: string;
  lastTransaction: string;
  frequency: string;
  isRecurring: boolean;
  category?: string;
  currency: string;
}

interface InvoiceStatusData {
  overview: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
  };
  totalOutstanding: number;
  totalOverdue: number;
  oldestOverdue?: { number: string; daysOverdue: number; amount: number };
  recentPayments: Array<{ number: string; amount: number; paidDate: string }>;
  currency: string;
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

    // Parse the question using LLM with fallback to regex
    let parsedQuery: ParsedQuery;
    try {
      parsedQuery = await classifyQueryWithLlm(request.message);
      // If LLM returns unknown with low confidence, try regex as fallback
      if (parsedQuery.type === 'unknown' && parsedQuery.confidence < 0.5) {
        const regexResult = parseQuery(request.message);
        if (regexResult.type !== 'unknown') {
          parsedQuery = regexResult;
          console.log('[Chat] LLM uncertain, using regex fallback:', parsedQuery.type);
        }
      }
    } catch (error) {
      // LLM failed, use regex fallback
      console.warn('[Chat] LLM classification failed, using regex:', error);
      parsedQuery = parseQuery(request.message);
    }

    // Execute the appropriate query
    const result = await this.executeQuery(parsedQuery, context);

    // Generate response using LLM for natural language
    const responseContent = await this.generateLlmResponse(
      request.message,
      parsedQuery,
      result,
      context
    );

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
  private async executeQuery(parsed: ParsedQuery, context: FinancialContext): Promise<QueryResult> {
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
            data: await this.dataProvider.getTotalSpending(context.workspaceId, startDate, endDate),
          };

        case 'total_income':
          return {
            success: true,
            data: await this.dataProvider.getTotalIncome(context.workspaceId, startDate, endDate),
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

        // New AI-first query handlers
        case 'subscription_analysis':
          return {
            success: true,
            data: await this.dataProvider.getSubscriptionAnalysis(context.workspaceId),
          };

        case 'money_leaks':
          return {
            success: true,
            data: await this.dataProvider.getMoneyLeaks(context.workspaceId),
          };

        case 'savings_opportunities':
          return {
            success: true,
            data: await this.dataProvider.getSavingsOpportunities(context.workspaceId),
          };

        case 'expense_comparison':
          return {
            success: true,
            data: await this.dataProvider.getExpenseComparison(
              context.workspaceId,
              startDate,
              endDate
            ),
          };

        case 'vendor_analysis':
          if (!parsed.merchant) {
            return { success: false, error: 'Could not identify vendor name' };
          }
          return {
            success: true,
            data: await this.dataProvider.getVendorAnalysis(
              context.workspaceId,
              parsed.merchant,
              startDate,
              endDate
            ),
          };

        case 'tax_deductions':
          // Placeholder - will be implemented in Phase 3
          return {
            success: true,
            data: {
              message:
                'Tax deduction tracking is coming soon! For now, I can help you categorize business expenses.',
              suggestion: 'Show my category breakdown',
            },
          };

        case 'invoice_status':
          return {
            success: true,
            data: await this.dataProvider.getInvoiceStatus(context.workspaceId),
          };

        case 'budget_check':
          // Placeholder - will require budget feature
          return {
            success: true,
            data: {
              message:
                'Budget tracking is coming soon! For now, I can show you your spending patterns.',
              suggestion: 'Show my spending this month',
            },
          };

        case 'financial_advice':
          // Combine multiple insights for advice
          return {
            success: true,
            data: {
              type: 'advice',
              suggestions: [
                'Review your subscriptions for potential savings',
                'Check for money leaks',
                'Review your runway',
              ],
            },
          };

        case 'help':
          return {
            success: true,
            data: {
              type: 'help',
            },
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
   * Generate response using LLM for natural, conversational output
   */
  private async generateLlmResponse(
    userMessage: string,
    parsed: ParsedQuery,
    result: QueryResult,
    context: FinancialContext
  ): Promise<string> {
    try {
      const llmClient = createLlmClient();

      // Build context about what data we have
      const dataContext = result.success
        ? JSON.stringify(result.data, null, 2)
        : `Error: ${result.error}`;

      const prompt = `You are a friendly, helpful AI financial assistant for a small business accounting app called Moneio.

USER'S QUESTION: "${userMessage}"

QUERY TYPE DETECTED: ${parsed.type}
TIME PERIOD: ${parsed.period || 'this_month'}
${parsed.merchant ? `MERCHANT: ${parsed.merchant}` : ''}
${parsed.category ? `CATEGORY: ${parsed.category}` : ''}

DATA FROM DATABASE:
${dataContext}

INSTRUCTIONS:
1. Answer the user's question naturally and conversationally
2. Use the data provided to give specific, accurate numbers
3. Format currency amounts nicely (e.g., "$1,234.56" or "€1.234,56")
4. Use **bold** for important numbers and key points
5. Keep responses concise but helpful (2-4 sentences for simple questions, more for complex)
6. If the data shows concerning trends, mention them helpfully
7. If asked about capabilities ("what can you do"), explain you can help with:
   - Tracking spending and income
   - Analyzing cash runway
   - Finding recurring expenses and subscriptions
   - Detecting money leaks and savings opportunities
   - Reviewing vendor spending
   - Answering financial questions
8. If there's an error or no data, be helpful and suggest what they can try
9. End with a brief relevant follow-up suggestion when appropriate
10. Be warm and professional, like a helpful financial advisor

Respond directly to the user (no quotes or "Response:" prefix):`;

      const response = await llmClient.complete(prompt);
      return response.trim();
    } catch (error) {
      console.error('[Chat] LLM response generation failed:', error);
      // Fallback to template-based response
      return this.generateResponse(parsed, result, context);
    }
  }

  /**
   * Generate natural language response from query result (template fallback)
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
          '- How much did I spend this month?\n' +
          "- What's my cash runway?\n" +
          '- Show my recurring expenses\n' +
          '- What are my biggest expenses?\n' +
          '- Am I profitable?'
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

      // New AI-first query formatters
      case 'subscription_analysis':
        return this.formatSubscriptionAnalysis(data);

      case 'money_leaks':
        return this.formatMoneyLeaks(data);

      case 'savings_opportunities':
        return this.formatSavingsOpportunities(data);

      case 'expense_comparison':
        return this.formatExpenseComparison(data);

      case 'vendor_analysis':
        return this.formatVendorAnalysis(parsed.merchant!, data);

      case 'tax_deductions':
        return this.formatPlaceholder(data, 'Tax Deductions');

      case 'invoice_status':
        return this.formatInvoiceStatus(data);

      case 'budget_check':
        return this.formatPlaceholder(data, 'Budget Status');

      case 'financial_advice':
        return this.formatFinancialAdvice(data);

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

    let response = `**Recurring Expenses:** ${this.formatCurrency(monthlyTotal, currency)}/month\n\n`;
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
        '**Great news!** Your business is profitable, which means you have unlimited runway. ' +
        "You're earning more than you're spending."
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
        'Consider reviewing your expenses or increasing revenue.'
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

  // New AI-first formatters
  private formatSubscriptionAnalysis(data: Record<string, unknown>): string {
    const subscriptionData = data as unknown as SubscriptionAnalysisData;
    const { subscriptions, totalMonthly, totalAnnual, flaggedCount, currency } = subscriptionData;

    if (!subscriptions || subscriptions.length === 0) {
      return "I haven't detected any subscriptions yet. Import more transactions to enable subscription tracking.";
    }

    let response = `**Subscription Analysis**\n\n`;
    response += `- Total: **${this.formatCurrency(totalMonthly, currency)}/month** (${this.formatCurrency(totalAnnual, currency)}/year)\n`;
    response += `- Active subscriptions: ${subscriptions.length}\n`;

    if (flaggedCount > 0) {
      response += `- ⚠️ **${flaggedCount} subscriptions need attention**\n`;
    }

    response += `\n**Your Subscriptions:**\n`;
    subscriptions.slice(0, 8).forEach((sub) => {
      response += `- ${sub.name}: ${this.formatCurrency(sub.monthlyEquivalent, currency)}/month (${sub.frequency})`;
      if (sub.flags.length > 0) {
        response += ` ⚠️`;
      }
      response += `\n`;
    });

    if (subscriptions.length > 8) {
      response += `\n...and ${subscriptions.length - 8} more`;
    }

    return response;
  }

  private formatMoneyLeaks(data: Record<string, unknown>): string {
    const leaksData = data as unknown as MoneyLeaksData;
    const { leaks, totalPotentialSavings, currency } = leaksData;

    if (!leaks || leaks.length === 0) {
      return "**Great news!** I haven't detected any money leaks. Your finances look healthy!";
    }

    let response = `**Money Leaks Detected**\n\n`;
    response += `Found **${leaks.length} issue${leaks.length > 1 ? 's' : ''}** with potential savings of **${this.formatCurrency(totalPotentialSavings, currency)}/year**\n\n`;

    leaks.slice(0, 5).forEach((leak, i) => {
      response += `${i + 1}. **${leak.title}**\n`;
      response += `   ${leak.description}\n`;
      response += `   💡 ${leak.recommendation}\n\n`;
    });

    if (leaks.length > 5) {
      response += `\n...and ${leaks.length - 5} more issues to review`;
    }

    return response;
  }

  private formatSavingsOpportunities(data: Record<string, unknown>): string {
    const savingsData = data as unknown as SavingsData;
    const { opportunities, totalPotentialSavings, currency } = savingsData;

    if (!opportunities || opportunities.length === 0) {
      return "I don't see any immediate savings opportunities. Your spending looks optimized!";
    }

    let response = `**Savings Opportunities**\n\n`;
    response += `Total potential savings: **${this.formatCurrency(totalPotentialSavings, currency)}/year**\n\n`;

    opportunities.forEach((opp, i) => {
      response += `${i + 1}. **${opp.title}**\n`;
      response += `   ${opp.description}\n`;
      if (opp.potentialSavings > 0) {
        response += `   Potential savings: ${this.formatCurrency(opp.potentialSavings, currency)}\n`;
      }
      response += `\n`;
    });

    return response;
  }

  private formatExpenseComparison(data: Record<string, unknown>): string {
    const comparisonData = data as unknown as ExpenseComparisonData;
    const { currentPeriod, previousPeriod, change, changePercent, trend, anomalies, currency } =
      comparisonData;

    let response = `**Expense Comparison**\n\n`;
    response += `- ${currentPeriod.periodLabel}: ${this.formatCurrency(currentPeriod.total, currency)}\n`;
    response += `- ${previousPeriod.periodLabel}: ${this.formatCurrency(previousPeriod.total, currency)}\n\n`;

    const trendEmoji = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
    const changeDirection = change >= 0 ? 'more' : 'less';
    response += `${trendEmoji} You spent **${this.formatCurrency(Math.abs(change), currency)} ${changeDirection}** (${Math.abs(changePercent).toFixed(1)}%)\n`;

    if (anomalies && anomalies.length > 0) {
      response += `\n**Unusual Activity:**\n`;
      anomalies.forEach((a) => {
        response += `- ${a.category}: ${a.description}\n`;
      });
    }

    return response;
  }

  private formatVendorAnalysis(merchant: string, data: Record<string, unknown>): string {
    const vendorData = data as unknown as VendorAnalysisData;
    const {
      totalSpent,
      transactionCount,
      averageTransaction,
      firstTransaction,
      lastTransaction,
      frequency,
      isRecurring,
      category,
      currency,
    } = vendorData;

    let response = `**${merchant} Analysis**\n\n`;
    response += `- Total spent: **${this.formatCurrency(totalSpent, currency)}**\n`;
    response += `- Transactions: ${transactionCount}\n`;
    response += `- Average: ${this.formatCurrency(averageTransaction, currency)}\n`;
    response += `- First transaction: ${firstTransaction}\n`;
    response += `- Last transaction: ${lastTransaction}\n`;

    if (isRecurring) {
      response += `\n🔄 This appears to be a **${frequency}** recurring payment`;
    }

    if (category) {
      response += `\n📁 Category: ${category}`;
    }

    return response;
  }

  private formatInvoiceStatus(data: Record<string, unknown>): string {
    const statusData = data as unknown as InvoiceStatusData;
    const { overview, totalOutstanding, totalOverdue, oldestOverdue, currency } = statusData;

    let response = `**Invoice Status**\n\n`;
    response += `- Total invoices: ${overview.total}\n`;
    response += `- Paid: ${overview.paid} ✅\n`;
    response += `- Pending: ${overview.pending}\n`;
    response += `- Overdue: ${overview.overdue} ⚠️\n\n`;

    response += `Outstanding: **${this.formatCurrency(totalOutstanding, currency)}**\n`;

    if (totalOverdue > 0) {
      response += `Overdue: **${this.formatCurrency(totalOverdue, currency)}**\n`;
    }

    if (oldestOverdue) {
      response += `\n⚠️ Oldest overdue: Invoice ${oldestOverdue.number} (${oldestOverdue.daysOverdue} days) - ${this.formatCurrency(oldestOverdue.amount, currency)}`;
    }

    return response;
  }

  private formatPlaceholder(data: Record<string, unknown>, feature: string): string {
    const message = data.message as string;
    const suggestion = data.suggestion as string;

    let response = `**${feature}**\n\n`;
    response += message || `This feature is coming soon!`;

    if (suggestion) {
      response += `\n\nIn the meantime, try: "${suggestion}"`;
    }

    return response;
  }

  private formatFinancialAdvice(data: Record<string, unknown>): string {
    const suggestions = data.suggestions as string[];

    let response = `**Here are some suggestions to improve your finances:**\n\n`;

    if (suggestions && suggestions.length > 0) {
      suggestions.forEach((s, i) => {
        response += `${i + 1}. ${s}\n`;
      });
    }

    response += `\nWould you like me to elaborate on any of these?`;

    return response;
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
      runway: ['Am I profitable?', 'What are my recurring expenses?', 'Show my cashflow'],
      profitable: ['What is my runway?', 'Show my cashflow', 'Where is my money going?'],
      pending_invoices: ['What is my income?', 'Am I profitable?', 'What is my cashflow?'],
      category_breakdown: [
        'What are my biggest expenses?',
        'Show recurring expenses',
        'Am I profitable?',
      ],
      // New AI-first query suggestions
      subscription_analysis: [
        'Where is my money leaking?',
        'How can I save money?',
        'Show my recurring expenses',
      ],
      money_leaks: [
        'What subscriptions am I paying for?',
        'How can I save money?',
        'Show my biggest expenses',
      ],
      savings_opportunities: [
        'Where is my money leaking?',
        'What subscriptions do I have?',
        'Am I profitable?',
      ],
      expense_comparison: [
        'Where is my money going?',
        'Show my biggest expenses',
        'What are my recurring expenses?',
      ],
      vendor_analysis: [
        'What are my recurring expenses?',
        'Where is my money going?',
        'Show category breakdown',
      ],
      tax_deductions: [
        'Show category breakdown',
        'What are my biggest expenses?',
        'How much did I spend on business?',
      ],
      invoice_status: ['What is my income?', 'What are my pending invoices?', 'Am I profitable?'],
      budget_check: [
        'How much did I spend this month?',
        'Am I spending more than usual?',
        'Where is my money going?',
      ],
      financial_advice: [
        'Where is my money leaking?',
        'What subscriptions do I have?',
        'What is my runway?',
      ],
      help: [
        'How much did I spend this month?',
        "What's my cash runway?",
        'Show my recurring expenses',
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
