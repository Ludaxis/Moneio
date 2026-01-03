/**
 * @moneio/app-services
 *
 * Application services layer providing:
 * - Tenant context (auth + workspace)
 * - API route wrappers
 * - Business logic services with caching
 */

// Shared utilities
export * from './shared';

// Transaction services
export * as transactions from './transactions';

// Dashboard services
export * as dashboard from './dashboard';

// Document services
export * as documents from './documents';

// Voice services
export * as voice from './voice';

// Report services
export * as reports from './reports';
