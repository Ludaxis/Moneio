/**
 * Transactions API (serverless-friendly)
 *
 * GET /api/transactions - List bank transactions for a workspace
 * DELETE /api/transactions - Delete multiple transactions by ID
 *
 * Centralized through @moneio/app-services with shared auth, permissions,
 * rate limiting, and observability.
 */

import { withApi, transactions } from '@moneio/app-services';
import { traceApiRoute } from '@moneio/observability/integrations/nextjs';
import type { NextRequest } from 'next/server';

import { initWebObservability } from '@/lib/observability';

const {
  deleteTransactions,
  transactionListQuerySchema,
  deleteTransactionsSchema,
  getTransactions,
} = transactions;

initWebObservability();

export const dynamic = 'force-dynamic';

/**
 * GET /api/transactions
 *
 * Query params:
 * - workspaceId: required UUID
 * - page: page number (default 1)
 * - pageSize: items per page (default 20, max 200)
 * - uncategorized: if 'true', only return uncategorized transactions
 * - includeSuggestions: if 'true', include pending AI suggestions
 */
const listHandler = withApi(
  async ({ query }) => {
    const { workspaceId, ...rest } = query;
    return getTransactions(workspaceId, rest);
  },
  {
    querySchema: transactionListQuerySchema,
    permission: 'transaction:read',
    rateLimit: { type: 'workspace', limiter: 'api' },
  }
);

export const GET = traceApiRoute('transactions.list', (request: NextRequest) =>
  listHandler(request)
);

/**
 * DELETE /api/transactions
 *
 * Body:
 * - transactionIds: array of UUIDs to delete (1-500)
 */
const deleteHandler = withApi(
  async ({ workspaceId, body }) => deleteTransactions(workspaceId, body.transactionIds),
  {
    bodySchema: deleteTransactionsSchema,
    permission: 'transaction:delete',
    rateLimit: { type: 'workspace', limiter: 'api' },
  }
);

export const DELETE = traceApiRoute('transactions.delete', (request: NextRequest) =>
  deleteHandler(request)
);
