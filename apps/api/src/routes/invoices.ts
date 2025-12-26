// Invoice routes
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const createInvoiceSchema = z.object({
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  merchantId: z.string().uuid().optional(),
  invoiceNumber: z.string().max(100).optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  currency: z.string().length(3),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unitPrice: z.number(),
        vatRate: z.number().min(0).max(1),
      })
    )
    .optional(),
  notes: z.string().optional(),
});

const updateInvoiceSchema = z.object({
  merchantId: z.string().uuid().nullable().optional(),
  invoiceNumber: z.string().max(100).optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  status: z.enum(['draft', 'approved', 'paid', 'void']).optional(),
  notes: z.string().optional(),
});

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  status: z.enum(['draft', 'approved', 'paid', 'void']).optional(),
  merchantId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const invoicesRoutes = new Hono();

// Create invoice
invoicesRoutes.post('/', zValidator('json', createInvoiceSchema), async (c) => {
  const data = c.req.valid('json');

  // TODO: Create invoice using service
  // const invoice = await invoiceService.createInvoice(data);

  return c.json(
    {
      id: crypto.randomUUID(),
      ...data,
      status: 'draft',
      createdAt: new Date().toISOString(),
    },
    201
  );
});

// Get invoice by ID
invoicesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Fetch from database
  // const { invoice, lineItems } = await invoiceService.getInvoiceWithLineItems(id);

  return c.json({
    id,
    workspaceId: 'workspace-id',
    invoiceNumber: 'INV-001',
    status: 'draft',
    currency: 'EUR',
    subtotal: { amount: 10000, currency: 'EUR', decimalPlaces: 2 },
    vatTotal: { amount: 2000, currency: 'EUR', decimalPlaces: 2 },
    total: { amount: 12000, currency: 'EUR', decimalPlaces: 2 },
    lineItems: [],
    createdAt: new Date().toISOString(),
  });
});

// List invoices
invoicesRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const query = c.req.valid('query');

  // TODO: Fetch from database with filters
  // const { items, total } = await invoiceService.getInvoicesByWorkspace(
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

// Update invoice
invoicesRoutes.patch('/:id', zValidator('json', updateInvoiceSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');

  // TODO: Update invoice
  // const invoice = await invoiceService.updateInvoice(id, data);

  return c.json({
    id,
    ...data,
    updatedAt: new Date().toISOString(),
  });
});

// Approve invoice
invoicesRoutes.post('/:id/approve', async (c) => {
  const id = c.req.param('id');

  // TODO: Update status
  // const invoice = await invoiceService.approveInvoice(id);

  return c.json({
    id,
    status: 'approved',
    approvedAt: new Date().toISOString(),
  });
});

// Mark invoice as paid
invoicesRoutes.post('/:id/mark-paid', async (c) => {
  const id = c.req.param('id');

  // TODO: Update status
  // const invoice = await invoiceService.markInvoicePaid(id);

  return c.json({
    id,
    status: 'paid',
    paidAt: new Date().toISOString(),
  });
});

// Void invoice
invoicesRoutes.post('/:id/void', async (c) => {
  const id = c.req.param('id');

  // TODO: Update status
  // const invoice = await invoiceService.voidInvoice(id);

  return c.json({
    id,
    status: 'void',
    voidedAt: new Date().toISOString(),
  });
});

// Delete invoice
invoicesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Delete invoice
  // await invoiceService.deleteInvoice(id);

  return c.json({
    id,
    message: 'Invoice deleted',
  });
});
