/**
 * Fast Voice Query API (serverless-friendly)
 *
 * POST /api/voice/query - Quick financial queries for voice interface
 *
 * Returns pre-formatted data without LLM delay.
 * Designed for ElevenLabs client tools which have short timeouts.
 */

import { withApi } from '@moneio/app-services';
import { prisma } from '@moneio/db';
import { traceApiRoute } from '@moneio/observability/integrations/nextjs';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { initWebObservability } from '@/lib/observability';

initWebObservability();

export const dynamic = 'force-dynamic';

// Body schema for voice query
const voiceQueryBodySchema = z.object({
  question: z.string().max(500).optional(),
});

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * POST /api/voice/query
 * Fast financial query endpoint for voice interface
 */
const queryHandler = withApi(
  async ({ workspaceId, body }) => {
    const question = body.question || '';
    const q = question.toLowerCase();

    // Get date ranges
    const now = new Date();

    // Parse specific month/year from question
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const shortMonths = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    ];

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

    // Check for year in question
    const yearMatch = q.match(/\b(202[0-9])\b/);
    if (yearMatch) {
      queryYear = parseInt(yearMatch[1]);
      specificPeriod = true;
    }

    // Handle "last month", "this month"
    if (q.includes('last month')) {
      queryMonth = now.getMonth() - 1;
      queryYear = queryMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
      queryMonth = queryMonth < 0 ? 11 : queryMonth;
      specificPeriod = true;
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

      return {
        answer: `Your cash flow for ${periodLabel} is ${formatCurrency(cashflow, currency)}. Income: ${formatCurrency(income, currency)}, Expenses: ${formatCurrency(expenses, currency)}.`,
      };
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

      const allTransactions = await prisma.bankTransaction.findMany({
        where: { workspaceId },
        select: { amount: true, currency: true },
      });
      const balance = allTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const runwayMonths = monthlyBurn > 0 ? Math.round(balance / monthlyBurn) : 0;
      const currency = transactions[0]?.currency || 'EUR';

      return {
        answer: `Your estimated runway is ${runwayMonths} months based on ${formatCurrency(monthlyBurn, currency)} monthly burn rate and ${formatCurrency(balance, currency)} current balance.`,
      };
    }

    if (q.includes('spending') || q.includes('spent') || q.includes('expenses')) {
      const merchants = [
        'aws', 'amazon', 'google', 'microsoft', 'figma',
        'netflix', 'spotify', 'openai', 'stripe', 'slack',
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

        return {
          answer: `You've spent ${formatCurrency(total, currency)} on ${mentionedMerchant.toUpperCase()} across ${transactions.length} transactions.`,
        };
      }

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

      return {
        answer: `Your total spending for ${periodLabel} is ${formatCurrency(total, currency)} across ${transactions.length} transactions.`,
      };
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

      return {
        answer: `Your total income for ${periodLabel} is ${formatCurrency(total, currency)} from ${transactions.length} transactions.`,
      };
    }

    if (q.includes('subscription') || q.includes('recurring')) {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          amount: { lt: 0 },
        },
        select: { description: true, merchantName: true, amount: true, currency: true },
        orderBy: { postedAt: 'desc' },
        take: 500,
      });

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

      const recurring = Array.from(merchantCounts.entries())
        .filter(([, data]) => data.count >= 3)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 5);

      const currency = transactions[0]?.currency || 'EUR';
      const totalMonthly = recurring.reduce((sum, [, data]) => sum + data.amount, 0);

      if (recurring.length === 0) {
        return {
          answer: "I couldn't find any clear recurring subscriptions in your transactions.",
        };
      }

      const list = recurring
        .map(([name, data]) => `${name}: ${formatCurrency(data.amount, currency)}`)
        .join(', ');

      return {
        answer: `Found ${recurring.length} likely subscriptions totaling ~${formatCurrency(totalMonthly, currency)}/month: ${list}`,
      };
    }

    if (q.includes('invoice') || q.includes('pending') || q.includes('owed') || q.includes('owes')) {
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
          merchant: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });

      if (invoices.length === 0) {
        return { answer: 'You have no pending invoices.' };
      }

      const totalAmount = invoices.reduce((sum, i) => sum + Number(i.total), 0);
      const currency = invoices[0]?.currency || 'EUR';
      const firstName = invoices[0].merchant?.name || invoices[0].invoiceNumber || 'Invoice';

      return {
        answer: `You have ${invoices.length} pending invoices totaling ${formatCurrency(totalAmount, currency)}. Top one: ${firstName} for ${formatCurrency(Number(invoices[0].total), currency)}.`,
      };
    }

    if (
      q.includes('biggest') || q.includes('largest') || q.includes('top') ||
      q.includes('most expensive') || q.includes('highest') || q.includes('expensive')
    ) {
      const wantsSingle =
        q.includes('the most') || q.includes('the biggest') ||
        q.includes('the largest') || q.includes('the highest') ||
        q.includes('what is') || q.includes('what was');
      const limit = wantsSingle ? 1 : 5;

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: { gte: startOfMonth, lte: endOfMonth },
          amount: { lt: 0 },
        },
        select: { description: true, merchantName: true, amount: true, currency: true, postedAt: true },
        orderBy: { amount: 'asc' },
        take: limit,
      });

      if (transactions.length === 0) {
        return { answer: `No expenses found for ${periodLabel}.` };
      }

      const currency = transactions[0]?.currency || 'EUR';

      if (wantsSingle && transactions.length > 0) {
        const t = transactions[0];
        const date = t.postedAt.toISOString().split('T')[0];
        return {
          answer: `Your most expensive expense in ${periodLabel} was ${t.merchantName || t.description} for ${formatCurrency(Math.abs(Number(t.amount)), currency)} on ${date}.`,
        };
      }

      const list = transactions
        .map((t) => `${t.merchantName || t.description}: ${formatCurrency(Math.abs(Number(t.amount)), currency)}`)
        .join(', ');

      return { answer: `Your biggest expenses for ${periodLabel}: ${list}` };
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

    return {
      answer: `${periodLabel}: ${transactions.length} transactions, ${formatCurrency(income, currency)} income, ${formatCurrency(expenses, currency)} expenses. Ask about cashflow, spending, subscriptions, invoices, or runway.`,
    };
  },
  {
    bodySchema: voiceQueryBodySchema,
    permission: 'transaction:read',
    rateLimit: { type: 'workspace', limiter: 'ai' },
  }
);

export const POST = traceApiRoute('voice.query', (request: NextRequest) =>
  queryHandler(request)
);
