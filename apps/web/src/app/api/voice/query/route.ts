import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

/**
 * Fast voice query endpoint - returns pre-formatted data without LLM delay
 * Designed for ElevenLabs client tools which have short timeouts
 */
export async function POST(request: Request) {
  try {
    const { workspaceId, question } = await request.json();

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    const q = question?.toLowerCase() || '';

    // Get date ranges
    const now = new Date();

    // Parse specific month/year from question (e.g., "November 2025", "nov 2025", "december")
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    let queryMonth = now.getMonth();
    let queryYear = now.getFullYear();
    let specificPeriod = false;

    // Check for month name in question
    for (let i = 0; i < monthNames.length; i++) {
      if (q.includes(monthNames[i]) || q.includes(shortMonths[i])) {
        queryMonth = i;
        specificPeriod = true;
        break;
      }
    }

    // Check for year in question (e.g., "2025", "2024")
    const yearMatch = q.match(/\b(202[0-9])\b/);
    if (yearMatch) {
      queryYear = parseInt(yearMatch[1]);
      specificPeriod = true;
    }

    // Handle "last month", "this month", "this year"
    if (q.includes('last month')) {
      queryMonth = now.getMonth() - 1;
      queryYear = queryMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
      queryMonth = queryMonth < 0 ? 11 : queryMonth;
      specificPeriod = true;
    } else if (q.includes('this year')) {
      // Will be handled separately for full year queries
    }

    const startOfMonth = specificPeriod
      ? new Date(queryYear, queryMonth, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = specificPeriod
      ? new Date(queryYear, queryMonth + 1, 0, 23, 59, 59)
      : now;
    const periodLabel = specificPeriod
      ? `${monthNames[queryMonth]} ${queryYear}`
      : 'this month';

    // Detect query type and respond quickly
    if (q.includes('cashflow') || q.includes('cash flow')) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth, lte: endOfMonth },
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
      const cashflow = income - expenses;
      const currency = transactions[0]?.currency || 'EUR';

      return NextResponse.json({
        answer: `Your cash flow for ${periodLabel} is ${formatCurrency(cashflow, currency)}. Income: ${formatCurrency(income, currency)}, Expenses: ${formatCurrency(expenses, currency)}.`,
      });
    }

    if (q.includes('runway')) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) },
        },
        select: { amount: true, currency: true },
      });

      const expenses = Math.abs(
        transactions
          .filter((t) => Number(t.amount) < 0)
          .reduce((sum, t) => sum + Number(t.amount), 0)
      );
      const monthlyBurn = expenses / 3;

      // Get current balance (sum of all transactions)
      const allTransactions = await prisma.bankTransaction.findMany({
        where: { workspaceId },
        select: { amount: true, currency: true },
      });
      const balance = allTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const runwayMonths = monthlyBurn > 0 ? Math.round(balance / monthlyBurn) : 0;
      const currency = transactions[0]?.currency || 'EUR';

      return NextResponse.json({
        answer: `Your estimated runway is ${runwayMonths} months based on ${formatCurrency(monthlyBurn, currency)} monthly burn rate and ${formatCurrency(balance, currency)} current balance.`,
      });
    }

    if (q.includes('spending') || q.includes('spent') || q.includes('expenses')) {
      // Check for specific merchant
      const merchants = [
        'aws',
        'amazon',
        'google',
        'microsoft',
        'figma',
        'netflix',
        'spotify',
        'openai',
        'stripe',
        'slack',
      ];
      const mentionedMerchant = merchants.find((m) => q.includes(m));

      if (mentionedMerchant) {
        const transactions = await prisma.bankTransaction.findMany({
          where: {
            workspaceId,
            OR: [
              { description: { contains: mentionedMerchant, mode: 'insensitive' } },
              { merchantName: { contains: mentionedMerchant, mode: 'insensitive' } },
            ],
          },
          select: { amount: true, currency: true, postedAt: true },
          orderBy: { postedAt: 'desc' },
          take: 100,
        });

        const total = Math.abs(
          transactions
            .filter((t) => Number(t.amount) < 0)
            .reduce((sum, t) => sum + Number(t.amount), 0)
        );
        const currency = transactions[0]?.currency || 'EUR';

        return NextResponse.json({
          answer: `You've spent ${formatCurrency(total, currency)} on ${mentionedMerchant.toUpperCase()} across ${transactions.length} transactions.`,
        });
      }

      // General spending for the period
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth, lte: endOfMonth },
          amount: { lt: 0 },
        },
        select: { amount: true, currency: true },
      });

      const total = Math.abs(transactions.reduce((sum, t) => sum + Number(t.amount), 0));
      const currency = transactions[0]?.currency || 'EUR';

      return NextResponse.json({
        answer: `Your total spending for ${periodLabel} is ${formatCurrency(total, currency)} across ${transactions.length} transactions.`,
      });
    }

    if (q.includes('income') || q.includes('earned') || q.includes('revenue')) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth, lte: endOfMonth },
          amount: { gt: 0 },
        },
        select: { amount: true, currency: true },
      });

      const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const currency = transactions[0]?.currency || 'EUR';

      return NextResponse.json({
        answer: `Your total income for ${periodLabel} is ${formatCurrency(total, currency)} from ${transactions.length} transactions.`,
      });
    }

    if (q.includes('subscription') || q.includes('recurring')) {
      // Find recurring transactions (same merchant, similar amounts)
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

      // Group by merchant and count
      const merchantCounts = new Map<string, { count: number; amount: number }>();
      for (const t of transactions) {
        const merchant = t.merchantName || t.description || 'Unknown';
        const normalized = merchant.toLowerCase().slice(0, 20);
        const existing = merchantCounts.get(normalized) || { count: 0, amount: 0 };
        merchantCounts.set(normalized, {
          count: existing.count + 1,
          amount: Math.abs(Number(t.amount)),
        });
      }

      // Find recurring (3+ occurrences)
      const recurring = Array.from(merchantCounts.entries())
        .filter(([, data]) => data.count >= 3)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 5);

      const currency = transactions[0]?.currency || 'EUR';
      const totalMonthly = recurring.reduce((sum, [, data]) => sum + data.amount, 0);

      if (recurring.length === 0) {
        return NextResponse.json({
          answer: "I couldn't find any clear recurring subscriptions in your transactions.",
        });
      }

      const list = recurring
        .map(([name, data]) => `${name}: ${formatCurrency(data.amount, currency)}`)
        .join(', ');

      return NextResponse.json({
        answer: `Found ${recurring.length} likely subscriptions totaling ~${formatCurrency(totalMonthly, currency)}/month: ${list}`,
      });
    }

    if (
      q.includes('invoice') ||
      q.includes('pending') ||
      q.includes('owed') ||
      q.includes('owes')
    ) {
      const invoices = await prisma.invoice.findMany({
        where: {
          workspaceId,
          status: { in: ['pending', 'PENDING', 'overdue', 'OVERDUE', 'sent', 'SENT'] },
        },
        select: {
          invoiceNumber: true,
          total: true,
          currency: true,
          dueDate: true,
          merchant: {
            select: { name: true },
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });

      if (invoices.length === 0) {
        return NextResponse.json({
          answer: 'You have no pending invoices.',
        });
      }

      const totalAmount = invoices.reduce((sum, i) => sum + Number(i.total), 0);
      const currency = invoices[0]?.currency || 'EUR';
      const firstName = invoices[0].merchant?.name || invoices[0].invoiceNumber || 'Invoice';

      return NextResponse.json({
        answer: `You have ${invoices.length} pending invoices totaling ${formatCurrency(totalAmount, currency)}. Top one: ${firstName} for ${formatCurrency(Number(invoices[0].total), currency)}.`,
      });
    }

    if (
      q.includes('biggest') ||
      q.includes('largest') ||
      q.includes('top') ||
      q.includes('most expensive') ||
      q.includes('highest') ||
      q.includes('expensive')
    ) {
      // Determine how many results to return
      const wantsSingle =
        q.includes('the most') ||
        q.includes('the biggest') ||
        q.includes('the largest') ||
        q.includes('the highest') ||
        q.includes('what is') ||
        q.includes('what was');
      const limit = wantsSingle ? 1 : 5;

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth, lte: endOfMonth },
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

      if (transactions.length === 0) {
        return NextResponse.json({
          answer: `No expenses found for ${periodLabel}.`,
        });
      }

      const currency = transactions[0]?.currency || 'EUR';

      if (wantsSingle && transactions.length > 0) {
        const t = transactions[0];
        const date = t.postedAt.toISOString().split('T')[0];
        return NextResponse.json({
          answer: `Your most expensive expense in ${periodLabel} was ${t.merchantName || t.description} for ${formatCurrency(Math.abs(Number(t.amount)), currency)} on ${date}.`,
        });
      }

      const list = transactions
        .map(
          (t) =>
            `${t.merchantName || t.description}: ${formatCurrency(Math.abs(Number(t.amount)), currency)}`
        )
        .join(', ');

      return NextResponse.json({
        answer: `Your biggest expenses for ${periodLabel}: ${list}`,
      });
    }

    // Default: return summary for the period
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        postedAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: { amount: true, currency: true },
    });

    const income = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expenses = Math.abs(
      transactions.filter((t) => Number(t.amount) < 0).reduce((sum, t) => sum + Number(t.amount), 0)
    );
    const currency = transactions[0]?.currency || 'EUR';

    return NextResponse.json({
      answer: `${periodLabel}: ${transactions.length} transactions, ${formatCurrency(income, currency)} income, ${formatCurrency(expenses, currency)} expenses. Ask about cashflow, spending, subscriptions, invoices, or runway.`,
    });
  } catch (error) {
    console.error('[Voice Query] Error:', error);
    return NextResponse.json({
      answer: 'Sorry, I had trouble accessing your financial data. Please try again.',
    });
  }
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}
