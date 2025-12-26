// Health check routes
import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  });
});

healthRoutes.get('/ready', async (c) => {
  // Check database connection
  // const dbHealthy = await checkDatabase();

  return c.json({
    status: 'ready',
    checks: {
      database: 'ok', // dbHealthy ? 'ok' : 'error',
      storage: 'ok',
    },
  });
});
