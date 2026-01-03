import { initializeNextJsObservability } from '@moneio/observability/integrations/nextjs';

let initialized = false;

/**
 * Initialize web-side observability once per process.
 */
export function initWebObservability(): void {
  if (initialized) return;

  initializeNextJsObservability({
    serviceName: process.env.DD_SERVICE || 'moneio-web',
    environment: process.env.DD_ENV || process.env.NODE_ENV || 'development',
  });

  initialized = true;
}
