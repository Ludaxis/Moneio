/**
 * Financial Query Patterns
 *
 * Recognizes common financial questions and extracts parameters
 * for database queries. Covers 80% of expected user questions.
 */

/**
 * Supported query types
 */
export type QueryType =
  | 'spending_by_merchant'
  | 'spending_by_category'
  | 'total_spending'
  | 'total_income'
  | 'cashflow'
  | 'largest_expenses'
  | 'recurring_expenses'
  | 'runway'
  | 'profitable'
  | 'pending_invoices'
  | 'category_breakdown'
  // New AI-first query types
  | 'subscription_analysis'
  | 'money_leaks'
  | 'savings_opportunities'
  | 'expense_comparison'
  | 'vendor_analysis'
  | 'tax_deductions'
  | 'invoice_status'
  | 'budget_check'
  | 'financial_advice'
  | 'unknown';

/**
 * Time period for queries
 */
export type TimePeriod =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'all_time';

/**
 * Parsed query with extracted parameters
 */
export interface ParsedQuery {
  type: QueryType;
  period?: TimePeriod;
  merchant?: string;
  category?: string;
  limit?: number;
  confidence: number;
}

/**
 * Pattern definition for query matching
 */
interface QueryPattern {
  type: QueryType;
  patterns: RegExp[];
  extractors?: {
    merchant?: RegExp;
    category?: RegExp;
    period?: RegExp;
    limit?: RegExp;
  };
}

/**
 * Time period keywords mapping
 */
const PERIOD_KEYWORDS: Record<string, TimePeriod> = {
  today: 'today',
  'this week': 'this_week',
  'this month': 'this_month',
  'last month': 'last_month',
  'this quarter': 'this_quarter',
  'this year': 'this_year',
  'past week': 'last_7_days',
  'past month': 'last_30_days',
  'last 7 days': 'last_7_days',
  'last 30 days': 'last_30_days',
  'last 90 days': 'last_90_days',
  'past 7 days': 'last_7_days',
  'past 30 days': 'last_30_days',
  'past 90 days': 'last_90_days',
  'all time': 'all_time',
  ever: 'all_time',
};

/**
 * Query patterns for recognition
 */
const QUERY_PATTERNS: QueryPattern[] = [
  // Spending by merchant
  {
    type: 'spending_by_merchant',
    patterns: [
      /how much (?:did i|have i|do i) (?:spend|spent|pay|paid) (?:on|at|to|for) (.+?)(?:\?|$| this| last| in)/i,
      /what (?:did i|have i) (?:spend|spent|pay|paid) (?:on|at|to|for) (.+?)(?:\?|$| this| last| in)/i,
      /(?:show|get|find) (?:me )?(?:all )?(?:spending|payments?|transactions?) (?:for|to|at|on) (.+?)(?:\?|$)/i,
      /(.+?) (?:spending|expenses?|payments?)(?:\?|$)/i,
    ],
    extractors: {
      merchant: /(?:on|at|to|for) (.+?)(?:\?|$| this| last| in)/i,
    },
  },

  // Spending by category
  {
    type: 'spending_by_category',
    patterns: [
      /how much (?:did i|have i|do i) (?:spend|spent) on (.+?) (?:category|expenses?)/i,
      /(?:spending|expenses?) (?:in|on|for) (.+?) category/i,
      /(.+?) category (?:spending|expenses?|total)/i,
    ],
    extractors: {
      category: /(?:on|in|for) (.+?) (?:category|expenses?)/i,
    },
  },

  // Total spending
  {
    type: 'total_spending',
    patterns: [
      /(?:total|how much) (?:did i |have i )?(?:spend|spent|expenses?)(?:\?|$| this| last)/i,
      /what (?:are|were) my (?:total )?expenses?/i,
      /(?:show|get) (?:me )?(?:my )?(?:total )?(?:spending|expenses?)/i,
    ],
  },

  // Total income
  {
    type: 'total_income',
    patterns: [
      /(?:total|how much) (?:did i |have i )?(?:earn|earned|made|income|revenue)/i,
      /what (?:is|was) my (?:total )?income/i,
      /(?:show|get) (?:me )?(?:my )?(?:total )?income/i,
    ],
  },

  // Cashflow
  {
    type: 'cashflow',
    patterns: [
      /(?:what is|what's|show) (?:me )?(?:my )?cash\s*flow/i,
      /money (?:in|coming in) (?:and|vs|versus) (?:out|going out)/i,
      /income (?:vs|versus|and) expenses?/i,
    ],
  },

  // Largest expenses
  {
    type: 'largest_expenses',
    patterns: [
      /(?:biggest|largest|top|highest) (?:\d+ )?(?:expenses?|payments?|spending)/i,
      /(?:what|where) (?:are|is) (?:my )?(?:biggest|largest|top) (?:expenses?|spending)/i,
      /(?:show|list|get) (?:me )?(?:my )?(?:top|biggest|largest) (?:\d+ )?(?:expenses?|payments?)/i,
    ],
    extractors: {
      limit: /(?:top|biggest|largest) (\d+)/i,
    },
  },

  // Recurring expenses
  {
    type: 'recurring_expenses',
    patterns: [
      /(?:recurring|subscription|monthly|regular) (?:expenses?|payments?|charges?)/i,
      /what (?:are|is) (?:my )?(?:recurring|subscriptions?)/i,
      /(?:show|list|get) (?:me )?(?:my )?(?:recurring|subscriptions?|regular payments?)/i,
    ],
  },

  // Runway
  {
    type: 'runway',
    patterns: [
      /(?:how much|what is|what's) (?:my )?runway/i,
      /how long (?:will|can) (?:my )?(?:money|cash|funds?) last/i,
      /(?:when will i|will i) run out of (?:money|cash|funds?)/i,
      /months? of runway/i,
    ],
  },

  // Profitable
  {
    type: 'profitable',
    patterns: [
      /am i (?:profitable|making money|in profit)/i,
      /(?:is|am) (?:my business|i) (?:profitable|making money)/i,
      /(?:what is|what's) my (?:profit|net income)/i,
    ],
  },

  // Pending invoices
  {
    type: 'pending_invoices',
    patterns: [
      /(?:pending|unpaid|outstanding|overdue) invoices?/i,
      /(?:what|how many) invoices? (?:are )?(?:pending|unpaid|outstanding)/i,
      /(?:show|list|get) (?:me )?(?:my )?(?:pending|unpaid|outstanding) invoices?/i,
    ],
  },

  // Category breakdown
  {
    type: 'category_breakdown',
    patterns: [
      /(?:spending|expenses?) (?:by|per) category/i,
      /(?:category|categorical) (?:breakdown|summary|split)/i,
      /(?:where|what) (?:is|does) (?:my )?money (?:go|going)/i,
      /break\s*down (?:my )?(?:spending|expenses?)/i,
    ],
  },

  // Subscription analysis
  {
    type: 'subscription_analysis',
    patterns: [
      /(?:what|show|list) (?:are )?(?:my )?subscriptions?/i,
      /(?:how much|what) (?:am i|do i) (?:pay|paying|spend|spending) on subscriptions?/i,
      /(?:analyze|review) (?:my )?subscriptions?/i,
      /(?:subscription|recurring) (?:costs?|summary|overview)/i,
      /(?:what|which) (?:services?|subscriptions?) (?:am i|do i) (?:pay|subscribe)/i,
    ],
  },

  // Money leaks
  {
    type: 'money_leaks',
    patterns: [
      /(?:where|what|how) (?:is|am|are) (?:my )?money (?:leaking|wasting|going)/i,
      /(?:find|detect|show) (?:my )?(?:money )?leaks?/i,
      /(?:wasting|losing) money/i,
      /(?:unnecessary|wasteful|duplicate) (?:charges?|expenses?|payments?)/i,
      /(?:hidden|forgotten) (?:fees?|charges?|subscriptions?)/i,
      /bank fees?/i,
    ],
  },

  // Savings opportunities
  {
    type: 'savings_opportunities',
    patterns: [
      /(?:how|where) can i save (?:money)?/i,
      /(?:ways?|tips?|suggestions?) to save/i,
      /(?:reduce|cut|lower) (?:my )?(?:expenses?|spending|costs?)/i,
      /(?:saving|savings) (?:opportunities|potential|suggestions?)/i,
      /(?:optimize|improve) (?:my )?(?:spending|finances?)/i,
    ],
  },

  // Expense comparison
  {
    type: 'expense_comparison',
    patterns: [
      /(?:am i|is) (?:spending|paying) more than (?:usual|normal|average)/i,
      /(?:compare|comparison) (?:my )?(?:spending|expenses?)/i,
      /spending (?:vs|versus|compared to) (?:last|previous)/i,
      /(?:unusual|abnormal) (?:spending|expenses?)/i,
      /(?:spending|expense) (?:trends?|patterns?)/i,
    ],
  },

  // Vendor analysis
  {
    type: 'vendor_analysis',
    patterns: [
      /how much (?:have i|did i) (?:pay|paid|spend|spent) (?:to|at|on) (.+?)(?:\?|$| this| last| in| ever| all)/i,
      /(?:total|all) (?:payments?|spending) (?:to|at|for) (.+)/i,
      /(.+?) (?:history|payments?|spending|total)/i,
      /(?:analyze|review) (?:my )?(?:spending|payments?) (?:to|at|for|on) (.+)/i,
    ],
    extractors: {
      merchant: /(?:to|at|on|for) (.+?)(?:\?|$| this| last| in| ever| all)/i,
    },
  },

  // Tax deductions
  {
    type: 'tax_deductions',
    patterns: [
      /(?:tax|taxable) (?:deductions?|deductible)/i,
      /(?:what|which) (?:expenses?|purchases?) (?:are|is) (?:tax )?deductible/i,
      /(?:business|work) expenses? (?:for taxes?)?/i,
      /(?:prepare|help with) (?:my )?taxes?/i,
      /(?:tax|taxes?) (?:summary|report|overview)/i,
    ],
  },

  // Invoice status
  {
    type: 'invoice_status',
    patterns: [
      /(?:overdue|late|unpaid) invoices?/i,
      /(?:invoice|invoices?) (?:status|summary)/i,
      /(?:who|which (?:clients?|customers?)) (?:owes?|hasn't paid)/i,
      /(?:outstanding|pending) (?:payments?|invoices?)/i,
      /(?:when will|expected) (?:payments?|money) (?:come in|arrive)/i,
    ],
  },

  // Budget check
  {
    type: 'budget_check',
    patterns: [
      /(?:am i|are we) (?:over|under|within) budget/i,
      /(?:budget|spending limit) (?:status|check)/i,
      /(?:how much|what) (?:budget|money) (?:is )?(?:left|remaining)/i,
      /(?:spending|expense) (?:vs|versus|against) budget/i,
    ],
  },

  // Financial advice
  {
    type: 'financial_advice',
    patterns: [
      /(?:should i|do you recommend)/i,
      /(?:what|how) should i (?:do|handle)/i,
      /(?:financial|money) (?:advice|tips?|suggestions?|recommendations?)/i,
      /(?:improve|better manage) (?:my )?(?:finances?|money)/i,
      /(?:financial|money) (?:health|status)/i,
    ],
  },
];

/**
 * Parse a natural language question into a structured query
 */
export function parseQuery(question: string): ParsedQuery {
  const normalizedQuestion = question.toLowerCase().trim();

  // Try each pattern
  for (const queryPattern of QUERY_PATTERNS) {
    for (const pattern of queryPattern.patterns) {
      const match = normalizedQuestion.match(pattern);
      if (match) {
        const parsed: ParsedQuery = {
          type: queryPattern.type,
          confidence: 0.8,
        };

        // Extract period
        parsed.period = extractPeriod(normalizedQuestion);

        // Extract type-specific parameters
        if (queryPattern.type === 'spending_by_merchant') {
          parsed.merchant = extractMerchant(question, match);
        }

        if (queryPattern.type === 'spending_by_category') {
          parsed.category = extractCategory(question, match);
        }

        if (queryPattern.type === 'largest_expenses') {
          parsed.limit = extractLimit(normalizedQuestion) || 10;
        }

        // Handle vendor_analysis similarly to spending_by_merchant
        if (queryPattern.type === 'vendor_analysis') {
          parsed.merchant = extractMerchant(question, match);
        }

        return parsed;
      }
    }
  }

  // No pattern matched
  return {
    type: 'unknown',
    period: extractPeriod(normalizedQuestion),
    confidence: 0.3,
  };
}

/**
 * Extract time period from question
 */
function extractPeriod(question: string): TimePeriod {
  for (const [keyword, period] of Object.entries(PERIOD_KEYWORDS)) {
    if (question.includes(keyword)) {
      return period;
    }
  }
  return 'this_month'; // Default to this month
}

/**
 * Extract merchant name from question
 */
function extractMerchant(_question: string, match: RegExpMatchArray): string | undefined {
  // Get the captured group if available
  if (match[1]) {
    let merchant = match[1].trim();

    // Clean up common suffixes
    merchant = merchant
      .replace(/\s*this\s*(?:month|week|year|quarter).*$/i, '')
      .replace(/\s*last\s*(?:month|week|year|quarter).*$/i, '')
      .replace(/\s*in\s*\d{4}.*$/i, '')
      .replace(/[?.,!]$/, '')
      .trim();

    return merchant || undefined;
  }

  return undefined;
}

/**
 * Extract category name from question
 */
function extractCategory(_question: string, match: RegExpMatchArray): string | undefined {
  if (match[1]) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Extract numeric limit from question
 */
function extractLimit(question: string): number | undefined {
  const match = question.match(/(?:top|biggest|largest) (\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Get date range for a time period
 */
export function getPeriodDateRange(period: TimePeriod): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;

    case 'this_week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      break;

    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate.setDate(0); // Last day of previous month
      break;

    case 'this_quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterStart, 1);
      break;
    }

    case 'this_year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;

    case 'last_7_days':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;

    case 'last_30_days':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      break;

    case 'last_90_days':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 90);
      break;

    case 'all_time':
      startDate = new Date(2000, 0, 1); // Far in the past
      break;

    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { startDate, endDate };
}

/**
 * Format period for display
 */
export function formatPeriod(period: TimePeriod): string {
  const labels: Record<TimePeriod, string> = {
    today: 'today',
    this_week: 'this week',
    this_month: 'this month',
    last_month: 'last month',
    this_quarter: 'this quarter',
    this_year: 'this year',
    last_7_days: 'the last 7 days',
    last_30_days: 'the last 30 days',
    last_90_days: 'the last 90 days',
    all_time: 'all time',
  };
  return labels[period] || 'this month';
}
