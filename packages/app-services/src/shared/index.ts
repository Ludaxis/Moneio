/**
 * Shared utilities for app-services
 */

// Error classes
export {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ConflictError,
} from './errors';

// Tenant context
export {
  getTenantContext,
  getTenantContextFromRequest,
  hasPermission,
  requirePermission,
  type TenantContext,
  type Workspace,
  type WorkspaceRole,
} from './tenant-context';

// API wrapper
export { withApi, withApiSimple, type WithApiOptions, type ApiContext } from './with-api';

// Rate limiting
export { checkRateLimit, getRateLimitRemaining } from './rate-limit';
