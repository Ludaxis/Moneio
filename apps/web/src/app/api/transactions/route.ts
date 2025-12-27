import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

/**
 * GET /api/transactions
 * List bank transactions for a workspace
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'workspace:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get transactions with category info
    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { workspaceId },
        orderBy: { postedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: {
              category: {
                select: { name: true },
              },
            },
          },
          matches: {
            where: { status: 'approved' },
            take: 1,
          },
        },
      }),
      prisma.bankTransaction.count({ where: { workspaceId } }),
    ]);

    // Transform to response format
    const formatted = transactions.map((tx) => ({
      id: tx.id,
      postedAt: tx.postedAt.toISOString(),
      description: tx.description,
      amount: tx.amount.toNumber(),
      currency: tx.currency,
      balance: tx.balance?.toNumber() ?? null,
      hasMatch: tx.matches.length > 0,
      categoryName: tx.categorizations[0]?.category.name ?? null,
    }));

    return NextResponse.json({
      transactions: formatted,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Failed to get transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
