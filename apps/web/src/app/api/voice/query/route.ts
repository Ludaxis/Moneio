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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Detect query type and respond quickly
    if (q.includes('cashflow') || q.includes('cash flow')) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth },
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
        answer: `Your cash flow this month is ${formatCurrency(cashflow, currency)}. Income: ${formatCurrency(income, currency)}, Expenses: ${formatCurrency(expenses, currency)}.`,
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

      // General spending this month
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth },
          amount: { lt: 0 },
        },
        select: { amount: true, currency: true },
      });

      const total = Math.abs(transactions.reduce((sum, t) => sum + Number(t.amount), 0));
      const currency = transactions[0]?.currency || 'EUR';

      return NextResponse.json({
        answer: `Your total spending this month is ${formatCurrency(total, currency)} across ${transactions.length} transactions.`,
      });
    }

    if (q.includes('income') || q.includes('earned') || q.includes('revenue')) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth },
          amount: { gt: 0 },
        },
        select: { amount: true, currency: true },
      });

      const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const currency = transactions[0]?.currency || 'EUR';

      return NextResponse.json({
        answer: `Your total income this month is ${formatCurrency(total, currency)} from ${transactions.length} transactions.`,
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

    if (q.includes('biggest') || q.includes('largest') || q.includes('top')) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth },
          amount: { lt: 0 },
        },
        select: {
          description: true,
          merchantName: true,
          amount: true,
          currency: true,
        },
        orderBy: { amount: 'asc' },
        take: 5,
      });

      if (transactions.length === 0) {
        return NextResponse.json({
          answer: 'No expenses found this month.',
        });
      }

      const currency = transactions[0]?.currency || 'EUR';
      const list = transactions
        .map(
          (t) =>
            `${t.merchantName || t.description}: ${formatCurrency(Math.abs(Number(t.amount)), currency)}`
        )
        .join(', ');

      return NextResponse.json({
        answer: `Your biggest expenses this month: ${list}`,
      });
    }

    // Default: return summary
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        postedAt: { gte: startOfMonth },
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
      answer: `This month: ${transactions.length} transactions, ${formatCurrency(income, currency)} income, ${formatCurrency(expenses, currency)} expenses. Ask about cashflow, spending, subscriptions, invoices, or runway.`,
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
