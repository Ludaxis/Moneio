/**
 * Plaid Client Configuration
 *
 * Initializes the Plaid client with environment-specific settings.
 * Supports sandbox, development, and production environments.
 */

import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Validate environment variables
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.warn(
    'Plaid credentials not configured. Set PLAID_CLIENT_ID and PLAID_SECRET environment variables.'
  );
}

/**
 * Get Plaid environment URL
 */
function getPlaidEnvironment(): string {
  switch (PLAID_ENV) {
    case 'production':
      return PlaidEnvironments.production;
    case 'development':
      return PlaidEnvironments.development;
    case 'sandbox':
    default:
      return PlaidEnvironments.sandbox;
  }
}

/**
 * Plaid client configuration
 */
const configuration = new Configuration({
  basePath: getPlaidEnvironment(),
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID || '',
      'PLAID-SECRET': PLAID_SECRET || '',
    },
  },
});

/**
 * Plaid API client instance
 */
export const plaidClient = new PlaidApi(configuration);

/**
 * Check if Plaid is configured
 */
export function isPlaidConfigured(): boolean {
  return Boolean(PLAID_CLIENT_ID && PLAID_SECRET);
}

/**
 * Get Plaid environment name
 */
export function getPlaidEnvName(): string {
  return PLAID_ENV;
}
