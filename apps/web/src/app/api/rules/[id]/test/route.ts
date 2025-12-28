/**
 * Rule Test API
 *
 * POST /api/rules/[id]/test - Test rule against transactions
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { testRuleAgainstTransactions } from '@/lib/rules';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const testSchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(10),
});

/**
 * POST /api/rules/[id]/test
 * Test a rule against recent transactions to see what would match
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = testSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, limit } = parsed.data;

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'rule:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get rule
    const rule = await prisma.rule.findFirst({
      where: { id, workspaceId },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Get recent transactions to test against
    const transactions = await prisma.bankTransaction.findMany({
      where: { workspaceId },
      take: limit,
      orderBy: { postedAt: 'desc' },
    });

    // Test rule against transactions
    const matches = testRuleAgainstTransactions(rule, transactions);

    // Format response
    const formattedMatches = matches.map((tx) => ({
      id: tx.id,
      description: tx.description,
      amount: tx.amount.toNumber(),
      postedAt: tx.postedAt.toISOString().split('T')[0],
      currency: tx.currency,
    }));

    return NextResponse.json({
      rule: {
        id: rule.id,
        name: rule.name,
        category: rule.category,
      },
      testedCount: transactions.length,
      matchedCount: matches.length,
      matches: formattedMatches,
    });
  } catch (error) {
    console.error('Failed to test rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
