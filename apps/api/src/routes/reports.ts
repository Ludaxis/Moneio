// Reports routes
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const periodSchema = z.object({
  workspaceId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  currency: z.string().length(3).optional(),
});

export const reportsRoutes = new Hono();

// Cashflow report
reportsRoutes.get('/cashflow', zValidator('query', periodSchema), async (c) => {
  const query = c.req.valid('query');

  // TODO: Generate cashflow report
  // const report = await reportingService.getCashflowReport(
  //   query.workspaceId,
  //   query.startDate,
  //   query.endDate,
  //   query.currency || 'EUR'
  // );

  return c.json({
    period: {
      start: query.startDate,
      end: query.endDate,
    },
    baseCurrency: query.currency || 'EUR',
    income: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    expenses: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    netCashflow: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    byCategory: [],
    byMonth: [],
  });
});

// VAT report
reportsRoutes.get('/vat', zValidator('query', periodSchema), async (c) => {
  const query = c.req.valid('query');

  // TODO: Generate VAT report
  // const report = await reportingService.getVatReport(
  //   query.workspaceId,
  //   query.startDate,
  //   query.endDate,
  //   query.currency || 'EUR'
  // );

  return c.json({
    period: {
      start: query.startDate,
      end: query.endDate,
    },
    baseCurrency: query.currency || 'EUR',
    vatCollected: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    vatPaid: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    netVat: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    byRate: [],
    entries: [],
  });
});

// Dashboard metrics
reportsRoutes.get('/dashboard', zValidator('query', periodSchema), async (c) => {
  const query = c.req.valid('query');

  // TODO: Generate dashboard metrics
  // const metrics = await reportingService.getDashboardMetrics(
  //   query.workspaceId,
  //   query.startDate,
  //   query.endDate,
  //   query.currency || 'EUR'
  // );

  return c.json({
    period: {
      start: query.startDate,
      end: query.endDate,
    },
    baseCurrency: query.currency || 'EUR',
    totalIncome: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    totalExpenses: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    netCashflow: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    burnRate: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    topMerchants: [],
    categoryBreakdown: [],
    trend: {
      currentMonth: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
      previousMonth: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
      changePercentage: 0,
      direction: 'stable',
    },
  });
});

// P&L summary
reportsRoutes.get('/pnl', zValidator('query', periodSchema), async (c) => {
  const query = c.req.valid('query');

  return c.json({
    period: {
      start: query.startDate,
      end: query.endDate,
    },
    baseCurrency: query.currency || 'EUR',
    revenue: {
      total: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
      byCategory: [],
    },
    expenses: {
      total: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
      byCategory: [],
    },
    grossProfit: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    netProfit: { amount: 0, currency: query.currency || 'EUR', decimalPlaces: 2 },
    margin: 0,
  });
});

// Export report
reportsRoutes.post('/export', async (c) => {
  const body = await c.req.json();

  // TODO: Generate export
  // const exportData = await reportingService.exportReport(body);

  return c.json({
    downloadUrl: 'https://storage.example.com/exports/report.xlsx',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    format: body.format || 'xlsx',
  });
});
