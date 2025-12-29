/**
 * API Route Workspace Permission Wrapper
 *
 * Extends authentication with workspace-level permission checks.
 * Handles both query param and route param workspaceId.
 */

import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

/**
 * Context passed to workspace handlers
 */
export interface WorkspaceContext {
  user: User;
  workspaceId: string;
  params?: Record<string, string>;
}

/**
 * Handler type for workspace-scoped routes
 */
export type WorkspaceHandler = (
  request: Request,
  context: WorkspaceContext
) => Promise<NextResponse>;

/**
 * Options for workspace wrapper
 */
export interface WithWorkspaceOptions {
  /**
   * Where to look for workspaceId (default: both 'query' and 'params')
   */
  workspaceIdSource?: 'query' | 'params' | 'body';
}

/**
 * Wraps an API route handler with workspace permission checks
 *
 * @param permission - The permission required (e.g., 'transaction:read')
 * @param handler - The route handler to wrap
 * @param options - Optional configuration
 *
 * @example
 * ```ts
 * // Query param: GET /api/transactions?workspaceId=xxx
 * export const GET = withWorkspace('transaction:read', async (request, { user, workspaceId }) => {
 *   const transactions = await getTransactions(workspaceId);
 *   return NextResponse.json({ transactions });
 * });
 *
 * // Route param: GET /api/workspaces/[workspaceId]/transactions
 * export const GET = withWorkspace(
 *   'transaction:read',
 *   async (request, { user, workspaceId }) => {
 *     const transactions = await getTransactions(workspaceId);
 *     return NextResponse.json({ transactions });
 *   },
 *   { workspaceIdSource: 'params' }
 * );
 * ```
 */
export function withWorkspace(
  permission: string,
  handler: WorkspaceHandler,
  options: WithWorkspaceOptions = {}
) {
  return async (
    request: Request,
    routeContext?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      // Authenticate user
      const supabase = createServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Resolve params if provided
      const params = routeContext?.params ? await routeContext.params : undefined;

      // Get workspaceId from the appropriate source
      let workspaceId: string | null = null;

      if (options.workspaceIdSource === 'params' || !options.workspaceIdSource) {
        // Try route params first
        workspaceId = params?.workspaceId || null;
      }

      if (!workspaceId && (options.workspaceIdSource === 'query' || !options.workspaceIdSource)) {
        // Try query params
        const { searchParams } = new URL(request.url);
        workspaceId = searchParams.get('workspaceId');
      }

      if (!workspaceId) {
        return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(workspaceId)) {
        return NextResponse.json({ error: 'Invalid workspace ID format' }, { status: 400 });
      }

      // Check permission
      const hasAccess = await hasPermission(user.id, workspaceId, permission);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      return handler(request, { user, workspaceId, params });
    } catch (error) {
      console.error('Workspace middleware error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Wraps an API route handler that requires owner permission
 *
 * @example
 * ```ts
 * export const DELETE = withWorkspaceOwner(async (request, { workspaceId }) => {
 *   await deleteWorkspace(workspaceId);
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withWorkspaceOwner(handler: WorkspaceHandler, options: WithWorkspaceOptions = {}) {
  return withWorkspace('workspace:delete', handler, options);
}

/**
 * Wraps an API route handler that requires admin permission
 */
export function withWorkspaceAdmin(handler: WorkspaceHandler, options: WithWorkspaceOptions = {}) {
  return withWorkspace('workspace:update', handler, options);
}
