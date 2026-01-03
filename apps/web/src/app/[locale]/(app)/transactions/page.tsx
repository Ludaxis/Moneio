/**
 * Transactions Page - Server Component
 *
 * Fetches initial transaction data on the server and passes to client component.
 * Uses Suspense for streaming and progressive loading.
 */

import { prisma } from '@moneio/db';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { TransactionsSkeleton } from '@/components/dashboard/skeletons';
import { getTransactions } from '@/lib/services/transactions';

import { TransactionsClient } from './transactions-client';

interface TransactionsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    workspace?: string;
    page?: string;
    pageSize?: string;
  }>;
}

/**
 * Get workspace ID from cookies or query params
 */
async function getWorkspaceId(
  searchParams: { workspace?: string },
  userId: string
): Promise<string | null> {
  // Check query param first
  if (searchParams.workspace) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: searchParams.workspace,
        members: { some: { userId } },
      },
      select: { id: true },
    });
    if (workspace) {
      return workspace.id;
    }
  }

  // Fall back to first workspace user has access to
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: {
      workspace: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return membership?.workspace.id ?? null;
}

/**
 * Create Supabase client for server component
 */
async function getUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * Page skeleton for loading state
 */
function TransactionsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
          <div className="h-10 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      {/* Table skeleton */}
      <TransactionsSkeleton />
    </div>
  );
}

/**
 * Server component that fetches data and renders transactions
 */
async function TransactionsContent({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: { workspace?: string; page?: string; pageSize?: string };
}) {
  const t = await getTranslations('transactions');
  const user = await getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-muted-foreground">Please sign in to view transactions.</p>
        </div>
      </div>
    );
  }

  const workspaceId = await getWorkspaceId(searchParams, user.id);

  if (!workspaceId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-muted-foreground">
            Create a workspace to start importing transactions.
          </p>
        </div>
      </div>
    );
  }

  // Parse pagination params
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.pageSize || '50', 10) || 50));

  // Fetch initial data on the server
  let initialData = {
    transactions: [] as Array<{
      id: string;
      postedAt: string;
      description: string | null;
      amount: number | string;
      currency: string;
      balance: number | string | null;
      hasMatch: boolean;
      categoryId: string | null;
      categoryName: string | null;
      pendingSuggestions?: Array<{
        id: string;
        type: 'categorization' | 'match';
        confidence: number;
        suggestedCategory?: { id: string; name: string };
        matchedInvoice?: { id: string; invoiceNumber: string | null; total: number };
        rationale?: string;
      }>;
    }>,
    total: 0,
    page,
    pageSize,
  };

  try {
    const result = await getTransactions(workspaceId, {
      page,
      pageSize,
      includeSuggestions: true,
    });
    initialData = result;
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    // Continue with empty data - client will handle empty state
  }

  return (
    <TransactionsClient
      workspaceId={workspaceId}
      locale={locale}
      initialTransactions={initialData.transactions}
      initialTotal={initialData.total}
      initialPage={initialData.page}
      initialPageSize={initialData.pageSize}
    />
  );
}

export default async function TransactionsPage({ params, searchParams }: TransactionsPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <Suspense fallback={<TransactionsPageSkeleton />}>
      <TransactionsContent locale={locale} searchParams={resolvedSearchParams} />
    </Suspense>
  );
}
