import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { prisma } from '@moneio/db';

// Tool definitions
const TOOLS = [
  {
    name: 'get_cashflow',
    description:
      'Get the cashflow summary showing income, expenses, and net cashflow for a period. Use this when users ask about their cashflow, money in/out, or financial summary.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
        period: {
          type: 'string',
          description: 'Time period: this_month, last_month, this_year, or all_time',
          enum: ['this_month', 'last_month', 'this_year', 'all_time'],
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_spending',
    description:
      'Get spending details by merchant, category, or total. Use this when users ask about their expenses or spending.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
        merchant: {
          type: 'string',
          description: 'Filter by merchant name (e.g., AWS, Netflix, Figma)',
        },
        period: {
          type: 'string',
          description: 'Time period: this_month, last_month, this_year, or all_time',
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_biggest_expenses',
    description:
      'Get the largest/biggest expenses for a period. Returns a list of top expenses sorted by amount.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
        period: {
          type: 'string',
          description: 'Time period: this_month, last_month, this_year',
        },
        limit: {
          type: 'number',
          description: 'Number of expenses to return (default: 5)',
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_income',
    description:
      'Get income/revenue for a period. Use when users ask about their earnings or income.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
        period: {
          type: 'string',
          description: 'Time period: this_month, last_month, this_year',
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_runway',
    description:
      'Calculate the cash runway - how many months until money runs out based on current burn rate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_subscriptions',
    description:
      'Get recurring subscriptions and their monthly costs. Use when users ask about their subscriptions or recurring payments.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_invoices',
    description:
      'Get pending/overdue invoices. Use when users ask about unpaid invoices or who owes them money.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
        status: {
          type: 'string',
          description: 'Invoice status filter: pending, overdue, paid, all',
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'search_transactions',
    description:
      'Search for specific transactions by description, merchant, or amount. Use for finding specific payments or charges.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace ID to query',
        },
        query: {
          type: 'string',
          description: 'Search term to find in transaction descriptions',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default: 10)',
        },
      },
      required: ['workspaceId', 'query'],
    },
  },
];

// Helper functions
function getDateRange(period: string | undefined): { start: Date; end: Date } {
  const now = new Date();
  const end = now;

  switch (period) {
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start, end: endOfLastMonth };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end };
    }
    case 'all_time': {
      const start = new Date(2000, 0, 1);
      return { start, end };
    }
    case 'this_month':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
  }
}

function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// Tool handlers
async function getCashflow(workspaceId: string, period?: string) {
  const { start, end } = getDateRange(period);

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      postedAt: { gte: start, lte: end },
    },
    select: { amount: true, currency: true },
  });

  const income = transactions
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenses = Math.abs(
    transactions.filter((t) => Number(t.amount) < 0).reduce((sum, t) => sum + Number(t.amount), 0)
  );

  const cashflow = income - expenses;
  const currency = transactions[0]?.currency || 'EUR';

  return {
    period: period || 'this_month',
    income: formatCurrency(income, currency),
    expenses: formatCurrency(expenses, currency),
    cashflow: formatCurrency(cashflow, currency),
    transactionCount: transactions.length,
    summary: `Cashflow for ${period || 'this month'}: ${formatCurrency(cashflow, currency)} (Income: ${formatCurrency(income, currency)}, Expenses: ${formatCurrency(expenses, currency)})`,
  };
}

async function getSpending(workspaceId: string, merchant?: string, period?: string) {
  const { start, end } = getDateRange(period);

  const whereClause: Record<string, unknown> = {
    workspaceId,
    postedAt: { gte: start, lte: end },
    amount: { lt: 0 },
  };

  if (merchant) {
    whereClause.OR = [
      { description: { contains: merchant, mode: 'insensitive' } },
      { merchantName: { contains: merchant, mode: 'insensitive' } },
    ];
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: whereClause,
    select: { amount: true, currency: true, description: true, merchantName: true },
    orderBy: { postedAt: 'desc' },
    take: 100,
  });

  const total = Math.abs(transactions.reduce((sum, t) => sum + Number(t.amount), 0));
  const currency = transactions[0]?.currency || 'EUR';

  return {
    period: period || 'this_month',
    merchant: merchant || 'all',
    totalSpending: formatCurrency(total, currency),
    transactionCount: transactions.length,
    summary: merchant
      ? `Spent ${formatCurrency(total, currency)} on ${merchant} (${transactions.length} transactions)`
      : `Total spending: ${formatCurrency(total, currency)} across ${transactions.length} transactions`,
  };
}

async function getBiggestExpenses(workspaceId: string, period?: string, limit: number = 5) {
  const { start, end } = getDateRange(period);

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      postedAt: { gte: start, lte: end },
      amount: { lt: 0 },
    },
    select: {
      description: true,
      merchantName: true,
      amount: true,
      currency: true,
      postedAt: true,
    },
    orderBy: { amount: 'asc' }, // Most negative first
    take: limit,
  });

  const currency = transactions[0]?.currency || 'EUR';
  const expenses = transactions.map((t, i) => ({
    rank: i + 1,
    merchant: t.merchantName || t.description || 'Unknown',
    amount: formatCurrency(Math.abs(Number(t.amount)), currency),
    date: t.postedAt.toISOString().split('T')[0],
  }));

  const list = expenses.map((e) => `${e.rank}. ${e.merchant}: ${e.amount}`).join(', ');

  return {
    period: period || 'this_month',
    expenses,
    summary: `Top ${limit} expenses for ${period || 'this month'}: ${list}`,
  };
}

async function getIncome(workspaceId: string, period?: string) {
  const { start, end } = getDateRange(period);

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      postedAt: { gte: start, lte: end },
      amount: { gt: 0 },
    },
    select: { amount: true, currency: true },
  });

  const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const currency = transactions[0]?.currency || 'EUR';

  return {
    period: period || 'this_month',
    totalIncome: formatCurrency(total, currency),
    transactionCount: transactions.length,
    summary: `Total income for ${period || 'this month'}: ${formatCurrency(total, currency)} from ${transactions.length} deposits`,
  };
}

async function getRunway(workspaceId: string) {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const recentTransactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      postedAt: { gte: threeMonthsAgo },
    },
    select: { amount: true, currency: true },
  });

  const expenses = Math.abs(
    recentTransactions
      .filter((t) => Number(t.amount) < 0)
      .reduce((sum, t) => sum + Number(t.amount), 0)
  );
  const monthlyBurn = expenses / 3;

  const allTransactions = await prisma.bankTransaction.findMany({
    where: { workspaceId },
    select: { amount: true, currency: true },
  });

  const balance = allTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const runwayMonths = monthlyBurn > 0 ? Math.round(balance / monthlyBurn) : 0;
  const currency = recentTransactions[0]?.currency || 'EUR';

  return {
    currentBalance: formatCurrency(balance, currency),
    monthlyBurnRate: formatCurrency(monthlyBurn, currency),
    runwayMonths,
    summary: `Your runway is ${runwayMonths} months. Current balance: ${formatCurrency(balance, currency)}, Monthly burn: ${formatCurrency(monthlyBurn, currency)}`,
  };
}

async function getSubscriptions(workspaceId: string) {
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      amount: { lt: 0 },
    },
    select: {
      description: true,
      merchantName: true,
      amount: true,
      currency: true,
    },
    orderBy: { postedAt: 'desc' },
    take: 500,
  });

  const merchantCounts = new Map<string, { count: number; amount: number }>();
  for (const t of transactions) {
    const merchant = t.merchantName || t.description || 'Unknown';
    const normalized = merchant.toLowerCase().slice(0, 30);
    const existing = merchantCounts.get(normalized) || { count: 0, amount: 0 };
    merchantCounts.set(normalized, {
      count: existing.count + 1,
      amount: Math.abs(Number(t.amount)),
    });
  }

  const recurring = Array.from(merchantCounts.entries())
    .filter(([, data]) => data.count >= 3)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10);

  const currency = transactions[0]?.currency || 'EUR';
  const totalMonthly = recurring.reduce((sum, [, data]) => sum + data.amount, 0);

  const subscriptions = recurring.map(([name, data]) => ({
    name,
    monthlyAmount: formatCurrency(data.amount, currency),
    occurrences: data.count,
  }));

  const list = subscriptions.map((s) => `${s.name}: ${s.monthlyAmount}`).join(', ');

  return {
    subscriptions,
    totalMonthly: formatCurrency(totalMonthly, currency),
    count: subscriptions.length,
    summary:
      subscriptions.length > 0
        ? `Found ${subscriptions.length} recurring subscriptions totaling ~${formatCurrency(totalMonthly, currency)}/month: ${list}`
        : 'No recurring subscriptions found',
  };
}

async function getInvoices(workspaceId: string, status?: string) {
  const statusFilter =
    status === 'all'
      ? undefined
      : status === 'paid'
        ? ['paid', 'PAID']
        : ['pending', 'PENDING', 'overdue', 'OVERDUE', 'sent', 'SENT'];

  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId,
      ...(statusFilter && { status: { in: statusFilter } }),
    },
    select: {
      invoiceNumber: true,
      total: true,
      currency: true,
      dueDate: true,
      status: true,
      merchant: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 20,
  });

  const totalAmount = invoices.reduce((sum, i) => sum + Number(i.total), 0);
  const currency = invoices[0]?.currency || 'EUR';

  const invoiceList = invoices.map((i) => ({
    number: i.invoiceNumber,
    client: i.merchant?.name || 'Unknown',
    amount: formatCurrency(Number(i.total), currency),
    dueDate: i.dueDate?.toISOString().split('T')[0],
    status: i.status,
  }));

  return {
    invoices: invoiceList,
    total: formatCurrency(totalAmount, currency),
    count: invoices.length,
    summary:
      invoices.length > 0
        ? `${invoices.length} ${status || 'pending'} invoices totaling ${formatCurrency(totalAmount, currency)}`
        : `No ${status || 'pending'} invoices found`,
  };
}

async function searchTransactions(workspaceId: string, query: string, limit: number = 10) {
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      OR: [
        { description: { contains: query, mode: 'insensitive' } },
        { merchantName: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      description: true,
      merchantName: true,
      amount: true,
      currency: true,
      postedAt: true,
    },
    orderBy: { postedAt: 'desc' },
    take: limit,
  });

  const currency = transactions[0]?.currency || 'EUR';
  const results = transactions.map((t) => ({
    merchant: t.merchantName || t.description || 'Unknown',
    amount: formatCurrency(Number(t.amount), currency),
    date: t.postedAt.toISOString().split('T')[0],
  }));

  return {
    query,
    results,
    count: results.length,
    summary:
      results.length > 0
        ? `Found ${results.length} transactions matching "${query}"`
        : `No transactions found matching "${query}"`,
  };
}

// Create and run the server
const server = new Server(
  {
    name: 'moneio-financial-data',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'get_cashflow':
        result = await getCashflow(args?.workspaceId as string, args?.period as string);
        break;
      case 'get_spending':
        result = await getSpending(
          args?.workspaceId as string,
          args?.merchant as string,
          args?.period as string
        );
        break;
      case 'get_biggest_expenses':
        result = await getBiggestExpenses(
          args?.workspaceId as string,
          args?.period as string,
          (args?.limit as number) || 5
        );
        break;
      case 'get_income':
        result = await getIncome(args?.workspaceId as string, args?.period as string);
        break;
      case 'get_runway':
        result = await getRunway(args?.workspaceId as string);
        break;
      case 'get_subscriptions':
        result = await getSubscriptions(args?.workspaceId as string);
        break;
      case 'get_invoices':
        result = await getInvoices(args?.workspaceId as string, args?.status as string);
        break;
      case 'search_transactions':
        result = await searchTransactions(
          args?.workspaceId as string,
          args?.query as string,
          (args?.limit as number) || 10
        );
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start the server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Moneio MCP Server running on stdio');
}

main().catch(console.error);
