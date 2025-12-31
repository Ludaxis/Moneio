import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

// CORS headers for ElevenLabs
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ toolName: string }> }
) {
  const { toolName } = await params;
  const args = await request.json();

  try {
    let result: unknown;

    switch (toolName) {
      case 'get_cashflow': {
        const { start, end } = getDateRange(args.period);
        const transactions = await prisma.bankTransaction.findMany({
          where: {
            workspaceId: args.workspaceId,
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

        result = {
          income: formatCurrency(income, currency),
          expenses: formatCurrency(expenses, currency),
          cashflow: formatCurrency(income - expenses, currency),
          summary: `Cashflow: ${formatCurrency(income - expenses, currency)} (Income: ${formatCurrency(income, currency)}, Expenses: ${formatCurrency(expenses, currency)})`,
        };
        break;
      }

      case 'get_biggest_expenses': {
        const { start, end } = getDateRange(args.period);
        const limit = args.limit || 5;

        const transactions = await prisma.bankTransaction.findMany({
          where: {
            workspaceId: args.workspaceId,
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
          orderBy: { amount: 'asc' },
          take: limit,
        });

        const currency = transactions[0]?.currency || 'EUR';
        const expenses = transactions.map((t, i) => ({
          rank: i + 1,
          merchant: t.merchantName || t.description || 'Unknown',
          amount: formatCurrency(Math.abs(Number(t.amount)), currency),
          date: t.postedAt.toISOString().split('T')[0],
        }));

        const list = expenses.map((e) => `${e.rank}. ${e.merchant}: ${e.amount}`).join('; ');
        result = {
          expenses,
          summary: `Top ${limit} expenses: ${list}`,
        };
        break;
      }

      case 'get_spending': {
        const { start, end } = getDateRange(args.period);
        const whereClause: Record<string, unknown> = {
          workspaceId: args.workspaceId,
          postedAt: { gte: start, lte: end },
          amount: { lt: 0 },
        };

        if (args.merchant) {
          whereClause.OR = [
            { description: { contains: args.merchant, mode: 'insensitive' } },
            { merchantName: { contains: args.merchant, mode: 'insensitive' } },
          ];
        }

        const transactions = await prisma.bankTransaction.findMany({
          where: whereClause,
          select: { amount: true, currency: true },
        });

        const total = Math.abs(transactions.reduce((sum, t) => sum + Number(t.amount), 0));
        const currency = transactions[0]?.currency || 'EUR';

        result = {
          total: formatCurrency(total, currency),
          count: transactions.length,
          summary: args.merchant
            ? `Spent ${formatCurrency(total, currency)} on ${args.merchant}`
            : `Total spending: ${formatCurrency(total, currency)} (${transactions.length} transactions)`,
        };
        break;
      }

      case 'get_income': {
        const { start, end } = getDateRange(args.period);
        const transactions = await prisma.bankTransaction.findMany({
          where: {
            workspaceId: args.workspaceId,
            postedAt: { gte: start, lte: end },
            amount: { gt: 0 },
          },
          select: { amount: true, currency: true },
        });

        const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
        const currency = transactions[0]?.currency || 'EUR';

        result = {
          total: formatCurrency(total, currency),
          count: transactions.length,
          summary: `Total income: ${formatCurrency(total, currency)} from ${transactions.length} deposits`,
        };
        break;
      }

      case 'get_runway': {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const recentTransactions = await prisma.bankTransaction.findMany({
          where: {
            workspaceId: args.workspaceId,
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
          where: { workspaceId: args.workspaceId },
          select: { amount: true, currency: true },
        });

        const balance = allTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
        const runwayMonths = monthlyBurn > 0 ? Math.round(balance / monthlyBurn) : 0;
        const currency = recentTransactions[0]?.currency || 'EUR';

        result = {
          runwayMonths,
          balance: formatCurrency(balance, currency),
          monthlyBurn: formatCurrency(monthlyBurn, currency),
          summary: `Runway: ${runwayMonths} months (Balance: ${formatCurrency(balance, currency)}, Monthly burn: ${formatCurrency(monthlyBurn, currency)})`,
        };
        break;
      }

      case 'get_subscriptions': {
        const transactions = await prisma.bankTransaction.findMany({
          where: {
            workspaceId: args.workspaceId,
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

        result = {
          subscriptions: recurring.map(([name, data]) => ({
            name,
            amount: formatCurrency(data.amount, currency),
          })),
          totalMonthly: formatCurrency(totalMonthly, currency),
          summary:
            recurring.length > 0
              ? `${recurring.length} subscriptions (~${formatCurrency(totalMonthly, currency)}/mo): ${list}`
              : 'No recurring subscriptions found',
        };
        break;
      }

      case 'get_invoices': {
        const statusFilter =
          args.status === 'paid'
            ? ['paid', 'PAID']
            : ['pending', 'PENDING', 'overdue', 'OVERDUE', 'sent', 'SENT'];

        const invoices = await prisma.invoice.findMany({
          where: {
            workspaceId: args.workspaceId,
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

        result = {
          invoices: invoices.map((i) => ({
            client: i.merchant?.name || i.invoiceNumber,
            amount: formatCurrency(Number(i.total), currency),
          })),
          total: formatCurrency(totalAmount, currency),
          summary:
            invoices.length > 0
              ? `${invoices.length} pending invoices totaling ${formatCurrency(totalAmount, currency)}`
              : 'No pending invoices',
        };
        break;
      }

      case 'search_transactions': {
        const transactions = await prisma.bankTransaction.findMany({
          where: {
            workspaceId: args.workspaceId,
            OR: [
              { description: { contains: args.query, mode: 'insensitive' } },
              { merchantName: { contains: args.query, mode: 'insensitive' } },
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
          take: args.limit || 10,
        });

        const currency = transactions[0]?.currency || 'EUR';
        result = {
          results: transactions.map((t) => ({
            merchant: t.merchantName || t.description,
            amount: formatCurrency(Number(t.amount), currency),
            date: t.postedAt.toISOString().split('T')[0],
          })),
          summary: `Found ${transactions.length} transactions matching "${args.query}"`,
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${toolName}` },
          { status: 404, headers: corsHeaders }
        );
    }

    return NextResponse.json({ result }, { headers: corsHeaders });
  } catch (error) {
    console.error(`Error executing ${toolName}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
