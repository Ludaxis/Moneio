/**
 * Demo Mode Data
 *
 * Comprehensive sample dataset for demo mode.
 * Represents a realistic small SaaS startup's finances.
 */

// Demo workspace
export const DEMO_WORKSPACE = {
  id: 'demo-workspace',
  name: 'Acme Startup Inc.',
  baseCurrency: 'USD',
  createdAt: '2024-01-01T00:00:00Z',
  ownerId: 'demo-user',
  settings: {
    fiscalYearStart: 1, // January
    timezone: 'America/New_York',
  },
};

// Demo user
export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@moneio.app',
  name: 'Demo User',
  avatarUrl: null,
};

// Dashboard metrics
export interface DemoMetrics {
  period: { start: string; end: string };
  baseCurrency: string;
  totalIncome: { amount: number; currency: string; formatted: string };
  totalExpenses: { amount: number; currency: string; formatted: string };
  netCashflow: { amount: number; currency: string; formatted: string };
  burnRate: { amount: number; currency: string; formatted: string };
  cashBalance: { amount: number; currency: string; formatted: string };
  trend: {
    currentMonth: { amount: number; currency: string };
    previousMonth: { amount: number; currency: string };
    changePercentage: number;
    direction: 'up' | 'down' | 'stable';
  };
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    type: 'income' | 'expense';
    amount: number;
    currency: string;
    percentage: number;
    transactionCount: number;
  }>;
  monthlyData: Array<{
    month: string;
    monthLabel: string;
    income: number;
    expenses: number;
    netCashflow: number;
  }>;
}

export const DEMO_METRICS: DemoMetrics = {
  period: { start: '2024-12-01', end: '2024-12-30' },
  baseCurrency: 'USD',
  totalIncome: { amount: 52100, currency: 'USD', formatted: '$52,100' },
  totalExpenses: { amount: 31840, currency: 'USD', formatted: '$31,840' },
  netCashflow: { amount: 20260, currency: 'USD', formatted: '$20,260' },
  burnRate: { amount: 4200, currency: 'USD', formatted: '$4,200' },
  cashBalance: { amount: 47250, currency: 'USD', formatted: '$47,250' },
  trend: {
    currentMonth: { amount: 20260, currency: 'USD' },
    previousMonth: { amount: 18100, currency: 'USD' },
    changePercentage: 12,
    direction: 'up',
  },
  categoryBreakdown: [
    {
      categoryId: 'cat-1',
      categoryName: 'Payroll',
      type: 'expense',
      amount: 15000,
      currency: 'USD',
      percentage: 47,
      transactionCount: 4,
    },
    {
      categoryId: 'cat-2',
      categoryName: 'Software & SaaS',
      type: 'expense',
      amount: 8500,
      currency: 'USD',
      percentage: 27,
      transactionCount: 12,
    },
    {
      categoryId: 'cat-3',
      categoryName: 'Marketing',
      type: 'expense',
      amount: 4200,
      currency: 'USD',
      percentage: 13,
      transactionCount: 8,
    },
    {
      categoryId: 'cat-4',
      categoryName: 'Office & Supplies',
      type: 'expense',
      amount: 2140,
      currency: 'USD',
      percentage: 7,
      transactionCount: 15,
    },
    {
      categoryId: 'cat-5',
      categoryName: 'Professional Services',
      type: 'expense',
      amount: 2000,
      currency: 'USD',
      percentage: 6,
      transactionCount: 2,
    },
  ],
  monthlyData: [
    { month: '2024-07', monthLabel: 'Jul', income: 42000, expenses: 28000, netCashflow: 14000 },
    { month: '2024-08', monthLabel: 'Aug', income: 45000, expenses: 29500, netCashflow: 15500 },
    { month: '2024-09', monthLabel: 'Sep', income: 43500, expenses: 31000, netCashflow: 12500 },
    { month: '2024-10', monthLabel: 'Oct', income: 48000, expenses: 30000, netCashflow: 18000 },
    { month: '2024-11', monthLabel: 'Nov', income: 50500, expenses: 32400, netCashflow: 18100 },
    { month: '2024-12', monthLabel: 'Dec', income: 52100, expenses: 31840, netCashflow: 20260 },
  ],
};

// Transactions
export interface DemoTransaction {
  id: string;
  postedAt: string;
  description: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string;
  accountName: string;
  matchedInvoiceId: string | null;
  status: 'pending' | 'cleared' | 'reconciled';
}

export const DEMO_TRANSACTIONS: DemoTransaction[] = [
  {
    id: 'tx-1',
    postedAt: '2024-12-29',
    description: 'Stripe Payment - Customer ABC Corp',
    amount: 2500,
    currency: 'USD',
    categoryId: 'cat-revenue',
    categoryName: 'Revenue',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: 'inv-1',
    status: 'cleared',
  },
  {
    id: 'tx-2',
    postedAt: '2024-12-28',
    description: 'AWS Monthly Bill - December',
    amount: -847.32,
    currency: 'USD',
    categoryId: 'cat-2',
    categoryName: 'Software & SaaS',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: null,
    status: 'cleared',
  },
  {
    id: 'tx-3',
    postedAt: '2024-12-27',
    description: 'Figma Team Subscription',
    amount: -75,
    currency: 'USD',
    categoryId: 'cat-2',
    categoryName: 'Software & SaaS',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: null,
    status: 'cleared',
  },
  {
    id: 'tx-4',
    postedAt: '2024-12-26',
    description: 'Google Ads Campaign - Winter 2024',
    amount: -1200,
    currency: 'USD',
    categoryId: 'cat-3',
    categoryName: 'Marketing',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: null,
    status: 'cleared',
  },
  {
    id: 'tx-5',
    postedAt: '2024-12-25',
    description: 'Client Invoice #1042 - XYZ Ltd',
    amount: 8500,
    currency: 'USD',
    categoryId: 'cat-revenue',
    categoryName: 'Revenue',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: 'inv-2',
    status: 'cleared',
  },
  {
    id: 'tx-6',
    postedAt: '2024-12-24',
    description: 'Slack Business+ Subscription',
    amount: -150,
    currency: 'USD',
    categoryId: 'cat-2',
    categoryName: 'Software & SaaS',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: null,
    status: 'cleared',
  },
  {
    id: 'tx-7',
    postedAt: '2024-12-23',
    description: 'Office Supplies - Amazon',
    amount: -89.99,
    currency: 'USD',
    categoryId: 'cat-4',
    categoryName: 'Office & Supplies',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: null,
    status: 'cleared',
  },
  {
    id: 'tx-8',
    postedAt: '2024-12-22',
    description: 'Vercel Pro Plan',
    amount: -20,
    currency: 'USD',
    categoryId: 'cat-2',
    categoryName: 'Software & SaaS',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: null,
    status: 'cleared',
  },
  {
    id: 'tx-9',
    postedAt: '2024-12-21',
    description: 'LinkedIn Advertising',
    amount: -500,
    currency: 'USD',
    categoryId: 'cat-3',
    categoryName: 'Marketing',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: null,
    status: 'cleared',
  },
  {
    id: 'tx-10',
    postedAt: '2024-12-20',
    description: 'Client Payment - Startup XYZ',
    amount: 3200,
    currency: 'USD',
    categoryId: 'cat-revenue',
    categoryName: 'Revenue',
    accountId: 'acc-1',
    accountName: 'Business Checking',
    matchedInvoiceId: 'inv-3',
    status: 'cleared',
  },
];

// Health score
export interface DemoHealthScore {
  overallScore: number;
  grade: string;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  metrics: Array<{
    name: string;
    score: number;
    rating: 'excellent' | 'good' | 'fair' | 'poor';
    value: string;
    description: string;
  }>;
  summary: string;
  recommendations: string[];
}

export const DEMO_HEALTH_SCORE: DemoHealthScore = {
  overallScore: 78,
  grade: 'B+',
  rating: 'good',
  metrics: [
    {
      name: 'profitability',
      score: 85,
      rating: 'excellent',
      value: '39%',
      description: 'Net profit margin',
    },
    {
      name: 'runway',
      score: 82,
      rating: 'good',
      value: '8.2 months',
      description: 'Cash runway',
    },
    {
      name: 'reserves',
      score: 65,
      rating: 'fair',
      value: '2.1 months',
      description: 'Emergency reserves',
    },
    {
      name: 'expensePredictability',
      score: 90,
      rating: 'excellent',
      value: '94%',
      description: 'Expense consistency',
    },
    {
      name: 'incomeStability',
      score: 68,
      rating: 'fair',
      value: 'Variable',
      description: 'Revenue stability',
    },
  ],
  summary:
    'Your financial health is good with strong profitability. Consider building more reserves.',
  recommendations: [
    'Increase emergency fund to 3 months of expenses',
    'Diversify revenue streams for more stability',
    'Review recurring software subscriptions for optimization',
  ],
};

// Runway data
export interface DemoRunway {
  months: number;
  burnRate: number;
  cashBalance: number;
  projectedRunoutDate: string;
  trend: 'improving' | 'stable' | 'declining';
}

export const DEMO_RUNWAY: DemoRunway = {
  months: 8.2,
  burnRate: 4200,
  cashBalance: 47250,
  projectedRunoutDate: '2025-08-15',
  trend: 'improving',
};

// AI Insights
export interface DemoAiInsight {
  id: string;
  type: 'opportunity' | 'alert' | 'tip' | 'anomaly';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  createdAt: string;
  action?: {
    label: string;
    href: string;
  };
}

export const DEMO_AI_INSIGHTS: DemoAiInsight[] = [
  {
    id: 'ai-1',
    type: 'opportunity',
    priority: 'high',
    title: 'Potential savings detected',
    message: 'You have 3 duplicate SaaS subscriptions totaling $245/month. Review them?',
    createdAt: '2024-12-29T10:00:00Z',
    action: { label: 'Review', href: '/transactions?filter=duplicates' },
  },
  {
    id: 'ai-2',
    type: 'alert',
    priority: 'medium',
    title: 'Unusual expense',
    message: 'Marketing spend is 40% higher than your 3-month average.',
    createdAt: '2024-12-28T14:30:00Z',
    action: { label: 'Investigate', href: '/reports?category=marketing' },
  },
  {
    id: 'ai-3',
    type: 'tip',
    priority: 'low',
    title: 'Categorization complete',
    message: '5 transactions were auto-categorized with 95% confidence.',
    createdAt: '2024-12-27T09:15:00Z',
  },
];

// Pending actions
export interface DemoPendingAction {
  id: string;
  type: 'invoice' | 'document' | 'transaction';
  title: string;
  description: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  isOverdue: boolean;
  href: string;
}

export const DEMO_PENDING_ACTIONS: DemoPendingAction[] = [
  {
    id: 'pa-1',
    type: 'invoice',
    title: 'Invoice #1045',
    description: 'Tech Solutions Corp - Website Development',
    amount: 5500,
    currency: 'USD',
    dueDate: '2025-01-05',
    isOverdue: false,
    href: '/invoices/pa-1',
  },
  {
    id: 'pa-2',
    type: 'document',
    title: 'Receipt - AWS',
    description: 'Pending extraction review',
    isOverdue: false,
    href: '/documents/pa-2',
  },
  {
    id: 'pa-3',
    type: 'transaction',
    title: 'Uncategorized: $342.50',
    description: 'STRIPE TRANSFER - 12/28',
    amount: 342.5,
    currency: 'USD',
    isOverdue: false,
    href: '/transactions?filter=uncategorized',
  },
  {
    id: 'pa-4',
    type: 'invoice',
    title: 'Invoice #1039',
    description: 'Global Partners Inc - Consulting',
    amount: 3200,
    currency: 'USD',
    dueDate: '2024-12-20',
    isOverdue: true,
    href: '/invoices/pa-4',
  },
];

// Forecast data
export interface DemoForecast {
  months: Array<{
    month: string;
    monthLabel: string;
    projected: number;
    actual?: number;
    lowerBound: number;
    upperBound: number;
  }>;
  confidence: number;
}

export const DEMO_FORECAST: DemoForecast = {
  months: [
    {
      month: '2024-12',
      monthLabel: 'Dec',
      projected: 20000,
      actual: 20260,
      lowerBound: 18000,
      upperBound: 22000,
    },
    {
      month: '2025-01',
      monthLabel: 'Jan',
      projected: 18500,
      lowerBound: 15000,
      upperBound: 22000,
    },
    {
      month: '2025-02',
      monthLabel: 'Feb',
      projected: 21000,
      lowerBound: 17000,
      upperBound: 25000,
    },
    {
      month: '2025-03',
      monthLabel: 'Mar',
      projected: 22500,
      lowerBound: 18000,
      upperBound: 27000,
    },
    {
      month: '2025-04',
      monthLabel: 'Apr',
      projected: 24000,
      lowerBound: 19000,
      upperBound: 29000,
    },
    {
      month: '2025-05',
      monthLabel: 'May',
      projected: 25500,
      lowerBound: 20000,
      upperBound: 31000,
    },
  ],
  confidence: 78,
};

// Categories
export interface DemoCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon?: string;
}

export const DEMO_CATEGORIES: DemoCategory[] = [
  { id: 'cat-revenue', name: 'Revenue', type: 'income', color: '#10B981' },
  { id: 'cat-1', name: 'Payroll', type: 'expense', color: '#EF4444' },
  { id: 'cat-2', name: 'Software & SaaS', type: 'expense', color: '#8B5CF6' },
  { id: 'cat-3', name: 'Marketing', type: 'expense', color: '#F59E0B' },
  { id: 'cat-4', name: 'Office & Supplies', type: 'expense', color: '#06B6D4' },
  { id: 'cat-5', name: 'Professional Services', type: 'expense', color: '#EC4899' },
  { id: 'cat-6', name: 'Travel', type: 'expense', color: '#14B8A6' },
  { id: 'cat-7', name: 'Utilities', type: 'expense', color: '#64748B' },
];
