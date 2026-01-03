/**
 * Dashboard Page - Server Component
 *
 * Fetches initial dashboard data on the server and passes to client component.
 * Uses Suspense for streaming and progressive loading.
 */

import { prisma } from '@moneio/db';
import { getIntlLocale, type Locale } from '@moneio/i18n';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { DashboardSkeleton } from '@/components/dashboard/skeletons';

import { DashboardClient } from './dashboard-client';

// Import service functions directly (they use cache() for deduplication)
// Note: In production, these would be imported from @moneio/app-services/dashboard
// For now, we fetch via API to avoid cross-package import issues
async function fetchDashboardData(
  workspaceId: string,
  baseCurrency: string,
  dateRange: { startDate: string; endDate: string },
  intlLocale: string
) {
  // Fetch metrics directly from database using the service logic
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId,
      postedAt: {
        gte: new Date(dateRange.startDate),
        lte: new Date(dateRange.endDate),
      },
    },
    include: {
      categorizations: {
        where: { approved: true },
        take: 1,
        include: { category: true },
      },
    },
  });

  let totalIncome = 0;
  let totalExpenses = 0;
  const monthlyData = new Map<string, { income: number; expenses: number }>();

  for (const tx of transactions) {
    const amount = Number(tx.amount);
    const month = tx.postedAt.toISOString().slice(0, 7);

    if (!monthlyData.has(month)) {
      monthlyData.set(month, { income: 0, expenses: 0 });
    }

    const data = monthlyData.get(month)!;
    if (amount >= 0) {
      totalIncome += amount;
      data.income += amount;
    } else {
      totalExpenses += Math.abs(amount);
      data.expenses += Math.abs(amount);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: baseCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const monthlyDataArray = Array.from(monthlyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      monthLabel: new Date(month + '-01').toLocaleDateString(intlLocale, {
        month: 'short',
        year: '2-digit',
      }),
      income: data.income,
      expenses: data.expenses,
      netCashflow: data.income - data.expenses,
    }));

  const netCashflow = totalIncome - totalExpenses;
  const burnRate = totalExpenses / (monthlyDataArray.length || 1);

  return {
    period: dateRange,
    baseCurrency,
    totalIncome: {
      amount: totalIncome,
      currency: baseCurrency,
      formatted: formatCurrency(totalIncome),
    },
    totalExpenses: {
      amount: totalExpenses,
      currency: baseCurrency,
      formatted: formatCurrency(totalExpenses),
    },
    netCashflow: {
      amount: netCashflow,
      currency: baseCurrency,
      formatted: formatCurrency(netCashflow),
    },
    burnRate: { amount: burnRate, currency: baseCurrency, formatted: formatCurrency(burnRate) },
    trend: {
      percentageChange: 0,
      direction: 'stable' as const,
      currentMonth: { amount: 0, currency: baseCurrency },
      previousMonth: { amount: 0, currency: baseCurrency },
    },
    monthlyData: monthlyDataArray,
  };
}

async function fetchRecentTransactions(workspaceId: string, limit: number = 5) {
  const transactions = await prisma.bankTransaction.findMany({
    where: { workspaceId },
    orderBy: { postedAt: 'desc' },
    take: limit,
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
    },
  });

  return transactions.map((tx) => ({
    id: tx.id,
    postedAt: tx.postedAt.toISOString(),
    description: tx.description,
    amount: tx.amount.toString(),
    currency: tx.currency,
    categoryName: tx.categorizations[0]?.category.name ?? null,
  }));
}

interface DashboardPageProps {
  params: { locale: Locale };
  searchParams: Promise<{
    workspace?: string;
    startDate?: string;
    endDate?: string;
  }>;
}

/**
 * Get default date range (last 30 days)
 */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  const startDate = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
  return { startDate, endDate };
}

/**
 * Get workspace ID from cookies or query params
 */
async function getWorkspaceId(
  searchParams: { workspace?: string },
  userId: string
): Promise<{ workspaceId: string; baseCurrency: string } | null> {
  // Check query param first
  if (searchParams.workspace) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: searchParams.workspace,
        members: { some: { userId } },
      },
      select: { id: true, baseCurrency: true },
    });
    if (workspace) {
      return { workspaceId: workspace.id, baseCurrency: workspace.baseCurrency };
    }
  }

  // Fall back to first workspace user has access to
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: {
      workspace: {
        select: { id: true, baseCurrency: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (membership) {
    return {
      workspaceId: membership.workspace.id,
      baseCurrency: membership.workspace.baseCurrency,
    };
  }

  return null;
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
 * Server component that fetches data and renders dashboard
 */
async function DashboardContent({
  searchParams,
  locale: _locale,
  intlLocale,
}: {
  searchParams: { workspace?: string; startDate?: string; endDate?: string };
  locale: Locale;
  intlLocale: string;
}) {
  const t = await getTranslations('navigation');
  const user = await getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>
        <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-muted-foreground">Please sign in to view your dashboard.</p>
        </div>
      </div>
    );
  }

  const workspaceData = await getWorkspaceId(searchParams, user.id);

  if (!workspaceData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('dashboard')}</h1>
        <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-muted-foreground">
            Create a workspace to get started with your AI-powered financial dashboard.
          </p>
        </div>
      </div>
    );
  }

  const { workspaceId, baseCurrency } = workspaceData;

  // Determine date range from URL or defaults
  const defaultRange = getDefaultDateRange();
  const dateRange = {
    startDate: searchParams.startDate || defaultRange.startDate,
    endDate: searchParams.endDate || defaultRange.endDate,
  };

  // Fetch initial data on the server
  let metrics = null;
  let transactions: Awaited<ReturnType<typeof fetchRecentTransactions>> = [];

  try {
    [metrics, transactions] = await Promise.all([
      fetchDashboardData(workspaceId, baseCurrency, dateRange, intlLocale),
      fetchRecentTransactions(workspaceId, 5),
    ]);
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    // Continue with null metrics - client will show error state
  }

  return (
    <DashboardClient
      workspaceId={workspaceId}
      baseCurrency={baseCurrency}
      initialMetrics={metrics}
      initialTransactions={transactions}
      initialDateRange={dateRange}
    />
  );
}

export default async function DashboardPage({ searchParams, params }: DashboardPageProps) {
  const { locale } = params;
  unstable_setRequestLocale(locale);
  const intlLocale = getIntlLocale(locale);
  const resolvedSearchParams = await searchParams;

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent
        searchParams={resolvedSearchParams}
        locale={locale}
        intlLocale={intlLocale}
      />
    </Suspense>
  );
}
