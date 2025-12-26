// Transaction routes
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  isReconciled: z.coerce.boolean().optional(),
  searchQuery: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const categorizeSchema = z.object({
  categoryId: z.string().uuid(),
});

const bulkCategorizeSchema = z.object({
  transactionIds: z.array(z.string().uuid()),
  categoryId: z.string().uuid(),
});

const importCsvSchema = z.object({
  workspaceId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  mapping: z.object({
    dateColumn: z.string(),
    descriptionColumn: z.string(),
    amountColumn: z.string(),
    dateFormat: z.string().optional(),
  }),
});

export const transactionsRoutes = new Hono();

// List transactions
transactionsRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const query = c.req.valid('query');

  // TODO: Fetch from database with filters
  // const { items, total } = await transactionService.getTransactionsByWorkspace(
  //   query.workspaceId,
  //   query
  // );

  return c.json({
    items: [],
    total: 0,
    limit: query.limit || 20,
    offset: query.offset || 0,
    hasMore: false,
  });
});

// Get transaction by ID
transactionsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Fetch from database
  // const transaction = await transactionService.getTransaction(id);

  return c.json({
    id,
    workspaceId: 'workspace-id',
    bankAccountId: 'account-id',
    postedAt: new Date().toISOString(),
    descriptionRaw: 'Payment to vendor',
    amount: { amount: -5000, currency: 'EUR', decimalPlaces: 2 },
    isReconciled: false,
    createdAt: new Date().toISOString(),
  });
});

// Categorize transaction
transactionsRoutes.post(
  '/:id/categorize',
  zValidator('json', categorizeSchema),
  async (c) => {
    const id = c.req.param('id');
    const { categoryId } = c.req.valid('json');

    // TODO: Update category
    // await transactionService.categorizeTransaction(id, categoryId);

    return c.json({
      id,
      categoryId,
      message: 'Transaction categorized',
    });
  }
);

// Bulk categorize transactions
transactionsRoutes.post(
  '/bulk-categorize',
  zValidator('json', bulkCategorizeSchema),
  async (c) => {
    const { transactionIds, categoryId } = c.req.valid('json');

    // TODO: Bulk categorize
    // const count = await transactionService.bulkCategorize(transactionIds, categoryId);

    return c.json({
      categorized: transactionIds.length,
      categoryId,
      message: 'Transactions categorized',
    });
  }
);

// Reconcile transaction
transactionsRoutes.post('/:id/reconcile', async (c) => {
  const id = c.req.param('id');

  // TODO: Mark as reconciled
  // await transactionService.reconcileTransaction(id);

  return c.json({
    id,
    isReconciled: true,
    reconciledAt: new Date().toISOString(),
  });
});

// Import CSV
transactionsRoutes.post('/import-csv', async (c) => {
  // TODO: Handle CSV file upload and parsing
  const body = await c.req.json();

  const validation = importCsvSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: 'Invalid request', details: validation.error.issues }, 400);
  }

  // TODO: Parse and import CSV
  // const result = await transactionService.importTransactionsFromCsv(
  //   body.workspaceId,
  //   body.bankAccountId,
  //   parsedRows
  // );

  return c.json({
    imported: 0,
    duplicates: 0,
    errors: [],
  });
});

// Get categories
transactionsRoutes.get('/categories', async (c) => {
  const workspaceId = c.req.query('workspaceId');

  if (!workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  // TODO: Fetch categories
  // const categories = await transactionService.getCategories(workspaceId);

  return c.json({
    categories: [
      { id: '1', name: 'Income', type: 'income' },
      { id: '2', name: 'Expenses', type: 'expense' },
      { id: '3', name: 'Transfers', type: 'transfer' },
    ],
  });
});

// Bank accounts routes
transactionsRoutes.get('/bank-accounts', async (c) => {
  const workspaceId = c.req.query('workspaceId');

  if (!workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  // TODO: Fetch bank accounts
  // const accounts = await transactionService.getBankAccountsByWorkspace(workspaceId);

  return c.json({
    accounts: [],
  });
});

transactionsRoutes.post('/bank-accounts', async (c) => {
  const body = await c.req.json();

  // TODO: Create bank account
  // const account = await transactionService.createBankAccount(body);

  return c.json(
    {
      id: crypto.randomUUID(),
      ...body,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    201
  );
});
