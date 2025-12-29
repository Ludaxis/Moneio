/**
 * API Route Authentication Wrapper
 *
 * Provides reusable authentication logic for API routes.
 * Eliminates repetitive auth boilerplate across 99+ routes.
 */

import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';

/**
 * Context passed to authenticated handlers
 */
export interface AuthContext {
  user: User;
  params?: Record<string, string>;
}

/**
 * Handler type for authenticated routes
 */
export type AuthenticatedHandler = (
  request: Request,
  context: AuthContext
) => Promise<NextResponse>;

/**
 * Wraps an API route handler with authentication
 *
 * @example
 * ```ts
 * export const GET = withAuth(async (request, { user }) => {
 *   // user is guaranteed to be authenticated here
 *   return NextResponse.json({ userId: user.id });
 * });
 * ```
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (
    request: Request,
    routeContext?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      const supabase = createServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Resolve params if provided
      const params = routeContext?.params ? await routeContext.params : undefined;

      return handler(request, { user, params });
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
