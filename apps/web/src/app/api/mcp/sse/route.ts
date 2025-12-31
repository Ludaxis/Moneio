import { prisma } from '@moneio/db';

import { verifyToken } from '../token/route';

// MCP SSE endpoint for ElevenLabs
// Implements Model Context Protocol over Server-Sent Events

const TOOLS = [
  {
    name: 'get_cashflow',
    description: 'Get cashflow summary showing income, expenses, and net cashflow for a period',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
        period: { type: 'string', description: 'Period: this_month, last_month, this_year, all_time' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_spending',
    description: 'Get total spending or spending by merchant',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        merchant: { type: 'string', description: 'Filter by merchant name' },
        period: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_income',
    description: 'Get total income for a period',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        period: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_runway',
    description: 'Calculate cash runway - months until money runs out based on burn rate',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_subscriptions',
    description: 'Get recurring subscriptions and their monthly cost',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_invoices',
    description: 'Get pending or overdue invoices',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        status: { type: 'string', description: 'Filter: pending, overdue, paid' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'search_transactions',
    description: 'Search transactions by description or merchant name',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        query: { type: 'string', description: 'Search term' },
        limit: { type: 'number' },
      },
      required: ['workspaceId', 'query'],
    },
  },
];

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

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_cashflow': {
      const { start, end } = getDateRange(args.period as string);
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId: args.workspaceId as string,
          postedAt: { gte: start, lte: end },
        },
        select: { amount: true, currency: true },
      });

      const income = transactions
        .filter((t) => Number(t.amount) > 0)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenses = Math.abs(
        transactions
          .filter((t) => Number(t.amount) < 0)
          .reduce((sum, t) => sum + Number(t.amount), 0)
      );
      const currency = transactions[0]?.currency || 'EUR';

      return `Cashflow: ${formatCurrency(income - expenses, currency)} (Income: ${formatCurrency(income, currency)}, Expenses: ${formatCurrency(expenses, currency)})`;
    }

    case 'get_spending': {
      const { start, end } = getDateRange(args.period as string);
      const whereClause: Record<string, unknown> = {
        workspaceId: args.workspaceId as string,
        postedAt: { gte: start, lte: end },
        amount: { lt: 0 },
      };

      if (args.merchant) {
        whereClause.OR = [
          { description: { contains: args.merchant as string, mode: 'insensitive' } },
          { merchantName: { contains: args.merchant as string, mode: 'insensitive' } },
        ];
      }

      const transactions = await prisma.bankTransaction.findMany({
        where: whereClause,
        select: { amount: true, currency: true },
      });

      const total = Math.abs(transactions.reduce((sum, t) => sum + Number(t.amount), 0));
      const currency = transactions[0]?.currency || 'EUR';

      return args.merchant
        ? `Spent ${formatCurrency(total, currency)} on ${args.merchant}`
        : `Total spending: ${formatCurrency(total, currency)} (${transactions.length} transactions)`;
    }

    case 'get_income': {
      const { start, end } = getDateRange(args.period as string);
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId: args.workspaceId as string,
          postedAt: { gte: start, lte: end },
          amount: { gt: 0 },
        },
        select: { amount: true, currency: true },
      });

      const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const currency = transactions[0]?.currency || 'EUR';

      return `Total income: ${formatCurrency(total, currency)} from ${transactions.length} deposits`;
    }

    case 'get_runway': {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const recentTransactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId: args.workspaceId as string,
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
        where: { workspaceId: args.workspaceId as string },
        select: { amount: true, currency: true },
      });

      const balance = allTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const runwayMonths = monthlyBurn > 0 ? Math.round(balance / monthlyBurn) : 0;
      const currency = recentTransactions[0]?.currency || 'EUR';

      return `Runway: ${runwayMonths} months (Balance: ${formatCurrency(balance, currency)}, Monthly burn: ${formatCurrency(monthlyBurn, currency)})`;
    }

    case 'get_subscriptions': {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId: args.workspaceId as string,
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
      const list = recurring
        .map(([name, data]) => `${name}: ${formatCurrency(data.amount, currency)}`)
        .join(', ');

      return recurring.length > 0
        ? `${recurring.length} subscriptions (~${formatCurrency(totalMonthly, currency)}/mo): ${list}`
        : 'No recurring subscriptions found';
    }

    case 'get_invoices': {
      const statusFilter =
        args.status === 'paid'
          ? ['paid', 'PAID']
          : ['pending', 'PENDING', 'overdue', 'OVERDUE', 'sent', 'SENT'];

      const invoices = await prisma.invoice.findMany({
        where: {
          workspaceId: args.workspaceId as string,
          status: { in: statusFilter },
        },
        select: {
          invoiceNumber: true,
          total: true,
          currency: true,
          dueDate: true,
          merchant: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });

      const totalAmount = invoices.reduce((sum, i) => sum + Number(i.total), 0);
      const currency = invoices[0]?.currency || 'EUR';

      return invoices.length > 0
        ? `${invoices.length} pending invoices totaling ${formatCurrency(totalAmount, currency)}`
        : 'No pending invoices';
    }

    case 'search_transactions': {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId: args.workspaceId as string,
          OR: [
            { description: { contains: args.query as string, mode: 'insensitive' } },
            { merchantName: { contains: args.query as string, mode: 'insensitive' } },
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
        take: (args.limit as number) || 10,
      });

      const currency = transactions[0]?.currency || 'EUR';
      const results = transactions
        .map(
          (t) =>
            `${t.merchantName || t.description}: ${formatCurrency(Number(t.amount), currency)} (${t.postedAt.toISOString().split('T')[0]})`
        )
        .join('; ');

      return `Found ${transactions.length} transactions: ${results}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// Handle MCP JSON-RPC requests
async function handleMcpRequest(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}): Promise<{
  jsonrpc: string;
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}> {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'moneio-mcp',
            version: '1.0.0',
          },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS,
        },
      };

    case 'tools/call': {
      const toolName = params?.name as string;
      const toolArgs = (params?.arguments || {}) as Record<string, unknown>;

      try {
        const result = await executeTool(toolName, toolArgs);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: result }],
          },
        };
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : 'Tool execution failed',
          },
        };
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}

// Get workspace ID from signed token (secure)
function getWorkspaceId(request: Request): string | null {
  const url = new URL(request.url);

  // Check for signed token (secure method)
  const token = url.searchParams.get('token') || request.headers.get('x-mcp-token');
  if (token) {
    const verified = verifyToken(token);
    if (verified) {
      return verified.workspaceId;
    }
    return null; // Invalid token
  }

  return null;
}

// SSE endpoint - GET establishes the SSE connection
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = getWorkspaceId(request);

  // If there's a message query param, it's a JSON-RPC request
  const messageParam = url.searchParams.get('message');

  if (messageParam) {
    try {
      const mcpRequest = JSON.parse(messageParam);
      // Inject workspaceId into tool calls if not provided
      if (mcpRequest.method === 'tools/call' && mcpRequest.params?.arguments && workspaceId) {
        mcpRequest.params.arguments.workspaceId =
          mcpRequest.params.arguments.workspaceId || workspaceId;
      }
      const response = await handleMcpRequest(mcpRequest);
      return new Response(JSON.stringify(response), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Establish SSE connection
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event with workspaceId info
      const event = `event: open\ndata: {"status":"connected","workspaceId":"${workspaceId || 'not-set'}"}\n\n`;
      controller.enqueue(encoder.encode(event));

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-workspace-id',
    },
  });
}

// POST handles JSON-RPC requests
export async function POST(request: Request) {
  try {
    const workspaceId = getWorkspaceId(request);
    const body = await request.json();

    // Inject workspaceId into tool calls if not provided
    if (body.method === 'tools/call' && body.params?.arguments && workspaceId) {
      body.params.arguments.workspaceId = body.params.arguments.workspaceId || workspaceId;
    }

    const response = await handleMcpRequest(body);

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
