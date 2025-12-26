// API Server entry point
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { documentsRoutes } from './routes/documents.js';
import { invoicesRoutes } from './routes/invoices.js';
import { transactionsRoutes } from './routes/transactions.js';
import { reportsRoutes } from './routes/reports.js';
import { chatRoutes } from './routes/chat.js';
import { healthRoutes } from './routes/health.js';

// Create app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

// Routes
app.route('/api/health', healthRoutes);
app.route('/api/documents', documentsRoutes);
app.route('/api/invoices', invoicesRoutes);
app.route('/api/transactions', transactionsRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/chat', chatRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json(
    {
      error: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    500
  );
});

// Start server
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`API server running at http://localhost:${port}`);

export default app;
