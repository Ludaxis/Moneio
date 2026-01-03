/**
 * withApi - Unified API route wrapper
 *
 * Handles auth, validation, rate limiting, permission checks, and error handling
 * in a single wrapper to keep API routes thin (< 50 lines).
 */

import { NextResponse } from 'next/server';
import type { z } from 'zod';

import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  RateLimitError,
} from './errors';
import { checkRateLimit } from './rate-limit';
import { getTenantContextFromRequest, hasPermission, type TenantContext } from './tenant-context';

export interface WithApiOptions<TQuery = unknown, TBody = unknown> {
  /**
   * Zod schema for query parameters validation.
   * Uses ZodType with flexible input to support .default() transformations.
   */
  querySchema?: z.ZodType<TQuery, z.ZodTypeDef, unknown>;

  /**
   * Zod schema for request body validation.
   * Uses ZodType with flexible input to support .default() transformations.
   */
  bodySchema?: z.ZodType<TBody, z.ZodTypeDef, unknown>;

  /**
   * Required permission (e.g., 'transaction:read')
   */
  permission?: string;

  /**
   * Rate limit configuration
   */
  rateLimit?: {
    /** Identifier type: 'user' (default) or 'workspace' */
    type?: 'user' | 'workspace';
    /** Limit type: 'api' (default), 'ai', or 'upload' */
    limiter?: 'api' | 'ai' | 'upload';
  };

  /**
   * Enable audit logging for this endpoint
   */
  audit?: boolean;
}

export interface ApiContext<TQuery = unknown, TBody = unknown> extends TenantContext {
  query: TQuery;
  body: TBody;
}

type ApiHandler<TQuery, TBody, TResult> = (ctx: ApiContext<TQuery, TBody>) => Promise<TResult>;

/**
 * Wrap an API route handler with common middleware
 *
 * @example
 * ```ts
 * export const GET = withApi(
 *   async ({ workspaceId, query }) => getTransactions(workspaceId, query),
 *   { querySchema: listQuerySchema, permission: 'transaction:read' }
 * );
 * ```
 */
export function withApi<TQuery = unknown, TBody = unknown, TResult = unknown>(
  handler: ApiHandler<TQuery, TBody, TResult>,
  options: WithApiOptions<TQuery, TBody> = {}
) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      // 1. Get tenant context (auth + workspace)
      const ctx = await getTenantContextFromRequest(request);

      // 2. Rate limiting
      if (options.rateLimit) {
        const identifier = options.rateLimit.type === 'workspace' ? ctx.workspaceId : ctx.user.id;
        const limiterType = options.rateLimit.limiter || 'api';
        await checkRateLimit(identifier, limiterType);
      }

      // 3. Permission check
      if (options.permission) {
        if (!hasPermission(ctx.role, options.permission)) {
          throw new ForbiddenError(`Permission denied: ${options.permission}`);
        }
      }

      // 4. Parse query parameters
      let query = {} as TQuery;
      if (options.querySchema) {
        const url = new URL(request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        const parsed = options.querySchema.safeParse(queryParams);

        if (!parsed.success) {
          const details: Record<string, string[]> = {};
          for (const error of parsed.error.errors) {
            const path = error.path.join('.');
            if (!details[path]) details[path] = [];
            details[path].push(error.message);
          }
          throw new ValidationError('Invalid query parameters', details);
        }
        query = parsed.data;
      }

      // 5. Parse request body
      let body = {} as TBody;
      if (options.bodySchema) {
        try {
          const json = await request.json();
          const parsed = options.bodySchema.safeParse(json);

          if (!parsed.success) {
            const details: Record<string, string[]> = {};
            for (const error of parsed.error.errors) {
              const path = error.path.join('.');
              if (!details[path]) details[path] = [];
              details[path].push(error.message);
            }
            throw new ValidationError('Invalid request body', details);
          }
          body = parsed.data;
        } catch (e) {
          if (e instanceof ValidationError) throw e;
          throw new ValidationError('Invalid JSON body');
        }
      }

      // 6. Execute handler
      const result = await handler({ ...ctx, query, body });

      // 7. Audit logging (if enabled)
      if (options.audit) {
        // TODO: Implement audit logging
        // await auditLog(ctx, request.method, request.url);
      }

      // 8. Return success response
      return NextResponse.json(result);
    } catch (error) {
      return handleError(error);
    }
  };
}

/**
 * Convert errors to appropriate HTTP responses
 */
function handleError(error: unknown): NextResponse {
  // Handle known errors
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 400 }
    );
  }

  if (error instanceof RateLimitError) {
    const headers: HeadersInit = {};
    if (error.retryAfter) {
      headers['Retry-After'] = String(error.retryAfter);
    }
    return NextResponse.json(
      { error: error.message, code: error.code, retryAfter: error.retryAfter },
      { status: 429, headers }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  // Log unexpected errors
  console.error('Unhandled API error:', error);

  // Generic error response (don't leak internal details)
  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  );
}

/**
 * Simplified wrapper for handlers that don't need query/body validation
 */
export function withApiSimple<TResult>(
  handler: (ctx: TenantContext) => Promise<TResult>,
  options: Omit<WithApiOptions, 'querySchema' | 'bodySchema'> = {}
) {
  return withApi<unknown, unknown, TResult>((ctx) => handler(ctx), options as WithApiOptions);
}
