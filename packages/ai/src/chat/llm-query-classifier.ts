/**
 * LLM-based Query Classifier
 *
 * Uses AI to understand natural language financial questions
 * and extract structured query parameters.
 */

import { createLlmClient } from '../clients';

import type { ParsedQuery, QueryType, TimePeriod } from './query-patterns';

/**
 * LLM response structure for query classification
 */
interface LlmClassificationResponse {
  type: QueryType;
  period?: TimePeriod;
  merchant?: string;
  category?: string;
  limit?: number;
  confidence: number;
}

/**
 * All supported query types with descriptions for the LLM
 */
const QUERY_TYPE_DESCRIPTIONS = `
QUERY TYPES (choose the most appropriate one):

1. "spending_by_merchant" - User asks about spending on a specific company/merchant
   Examples: "How much did I spend on AWS?", "What did I pay Figma?", "Netflix spending"

2. "spending_by_category" - User asks about spending in a category
   Examples: "How much on software?", "Marketing expenses", "Food category spending"

3. "total_spending" - User asks about total/overall spending
   Examples: "How much did I spend?", "Total expenses", "What are my expenses?"

4. "total_income" - User asks about income/earnings/revenue
   Examples: "How much did I earn?", "What's my income?", "Revenue this month"

5. "cashflow" - User asks about money in vs out, cash flow
   Examples: "What's my cashflow?", "Money in and out", "Income vs expenses"

6. "largest_expenses" - User asks about biggest/top expenses
   Examples: "Biggest expenses", "Top 5 spending", "Where did most money go?"

7. "recurring_expenses" - User asks about recurring/subscription payments
   Examples: "Recurring expenses", "My subscriptions", "Monthly charges"

8. "runway" - User asks about cash runway, how long money will last
   Examples: "What's my runway?", "How long will money last?", "When will I run out?"

9. "profitable" - User asks if business is profitable, making money
   Examples: "Am I profitable?", "Am I making money?", "Net profit"

10. "pending_invoices" - User asks about unpaid/pending invoices
    Examples: "Pending invoices", "Who owes me?", "Unpaid bills"

11. "category_breakdown" - User asks for spending breakdown by category
    Examples: "Breakdown by category", "Where is my money going?", "Spending categories"

12. "subscription_analysis" - User asks about subscriptions analysis
    Examples: "Analyze my subscriptions", "Subscription audit", "What am I subscribed to?"

13. "money_leaks" - User asks about wasted money, unnecessary expenses
    Examples: "Money leaks", "Where am I wasting money?", "Unnecessary expenses"

14. "savings_opportunities" - User asks how to save money
    Examples: "How can I save?", "Saving opportunities", "Cut costs"

15. "expense_comparison" - User asks to compare expenses over time
    Examples: "Am I spending more than usual?", "Compare to last month", "Expense trend"

16. "vendor_analysis" - User asks for detailed analysis of a specific vendor
    Examples: "Analyze AWS spending", "Tell me about my Stripe payments", "Review Figma costs"

17. "tax_deductions" - User asks about tax deductible expenses
    Examples: "Tax deductions", "What's deductible?", "Business expenses for taxes"

18. "invoice_status" - User asks about invoice/payment status
    Examples: "Invoice status", "Payment overview", "Who hasn't paid?"

19. "budget_check" - User asks about budget status
    Examples: "Am I over budget?", "Budget status", "How much budget left?"

20. "financial_advice" - User asks for financial advice/recommendations
    Examples: "What should I do?", "Financial advice", "How to improve finances?"

21. "help" - User asks what the assistant can do, capabilities, or greetings
    Examples: "What can you do?", "Help", "What can you help me with?", "Hi", "Hello"

22. "unknown" - Question doesn't match any financial query type
`;

const TIME_PERIOD_DESCRIPTIONS = `
TIME PERIODS (extract if mentioned, otherwise null):

- "today" - today
- "this_week" - this week, current week
- "this_month" - this month, current month (DEFAULT if not specified)
- "last_month" - last month, previous month
- "this_quarter" - this quarter, Q1/Q2/Q3/Q4
- "this_year" - this year, YTD, year to date
- "last_7_days" - last 7 days, past week
- "last_30_days" - last 30 days, past month
- "last_90_days" - last 90 days, past quarter
- "all_time" - all time, ever, total
`;

/**
 * Classify a natural language financial question using LLM
 */
export async function classifyQueryWithLlm(question: string): Promise<ParsedQuery> {
  try {
    const llmClient = createLlmClient();

    const prompt = `You are a financial query classifier. Analyze the user's question and extract:
1. The query type (what kind of financial information they want)
2. Time period (if mentioned)
3. Merchant/vendor name (if asking about a specific company)
4. Category name (if asking about a spending category)
5. Limit (if asking for top N items)

${QUERY_TYPE_DESCRIPTIONS}

${TIME_PERIOD_DESCRIPTIONS}

USER QUESTION: "${question}"

Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "type": "<query_type>",
  "period": "<time_period or null>",
  "merchant": "<merchant name or null>",
  "category": "<category name or null>",
  "limit": <number or null>,
  "confidence": <0.0-1.0 how confident you are>
}

IMPORTANT RULES:
- For "runway", "subscriptions", "money_leaks" questions - period is usually not needed
- Extract merchant names exactly as the user mentions them (e.g., "AWS", "Netflix", "Figma")
- If user asks about a specific company's spending, use "vendor_analysis" for detailed analysis or "spending_by_merchant" for simple totals
- Default period to "this_month" only if the question implies current period
- Set confidence based on how clear the user's intent is (0.9+ for clear questions, 0.5-0.7 for ambiguous)
- If you can't understand the question at all, use type "unknown" with low confidence`;

    const response = await llmClient.complete(prompt);

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[LLM Classifier] Failed to extract JSON from response:', response);
      return { type: 'unknown', confidence: 0.3 };
    }

    const parsed: LlmClassificationResponse = JSON.parse(jsonMatch[0]);

    // Validate and return ParsedQuery
    const result: ParsedQuery = {
      type: isValidQueryType(parsed.type) ? parsed.type : 'unknown',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };

    if (parsed.period && isValidTimePeriod(parsed.period)) {
      result.period = parsed.period;
    }

    if (parsed.merchant && typeof parsed.merchant === 'string') {
      result.merchant = parsed.merchant;
    }

    if (parsed.category && typeof parsed.category === 'string') {
      result.category = parsed.category;
    }

    if (parsed.limit && typeof parsed.limit === 'number' && parsed.limit > 0) {
      result.limit = parsed.limit;
    }

    console.log('[LLM Classifier] Question:', question);
    console.log('[LLM Classifier] Result:', result);

    return result;
  } catch (error) {
    console.error('[LLM Classifier] Error:', error);
    // Fallback to unknown
    return { type: 'unknown', confidence: 0.2 };
  }
}

/**
 * Validate query type
 */
function isValidQueryType(type: string): type is QueryType {
  const validTypes: QueryType[] = [
    'spending_by_merchant',
    'spending_by_category',
    'total_spending',
    'total_income',
    'cashflow',
    'largest_expenses',
    'recurring_expenses',
    'runway',
    'profitable',
    'pending_invoices',
    'category_breakdown',
    'subscription_analysis',
    'money_leaks',
    'savings_opportunities',
    'expense_comparison',
    'vendor_analysis',
    'tax_deductions',
    'invoice_status',
    'budget_check',
    'financial_advice',
    'help',
    'unknown',
  ];
  return validTypes.includes(type as QueryType);
}

/**
 * Validate time period
 */
function isValidTimePeriod(period: string): period is TimePeriod {
  const validPeriods: TimePeriod[] = [
    'today',
    'this_week',
    'this_month',
    'last_month',
    'this_quarter',
    'this_year',
    'last_7_days',
    'last_30_days',
    'last_90_days',
    'all_time',
  ];
  return validPeriods.includes(period as TimePeriod);
}
