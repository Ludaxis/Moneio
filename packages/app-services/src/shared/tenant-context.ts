/**
 * Tenant Context - Unified auth + workspace context using React cache()
 *
 * This provides request-scoped deduplication for auth and workspace data.
 * Multiple calls to getTenantContext() in the same request return the same cached result.
 */

import { prisma } from '@moneio/db';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { headers, cookies } from 'next/headers';

import { UnauthorizedError, ForbiddenError, ValidationError } from './errors';
import { roleHasPermission, type WorkspaceRole } from './permissions';

// React's cache() is only available in RSC context
// Provide a passthrough fallback for non-RSC environments (tests, etc.)
let cache: <T extends (...args: unknown[]) => unknown>(fn: T) => T;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  cache = require('react').cache;
} catch {
  // Fallback: just return the function as-is (no caching)
  cache = <T extends (...args: unknown[]) => unknown>(fn: T): T => fn;
}

// Validate cache is a function, fallback if not (e.g., in test environments)
if (typeof cache !== 'function') {
  cache = <T extends (...args: unknown[]) => unknown>(fn: T): T => fn;
}

// Re-export for convenience
export type { WorkspaceRole } from './permissions';

export interface Workspace {
  id: string;
  name: string;
  baseCurrency: string;
}

export interface TenantContext {
  user: User;
  workspaceId: string;
  workspace: Workspace;
  role: WorkspaceRole;
}

/**
 * Create Supabase server client
 */
function createSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Handle cookies in Server Component
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Handle cookies in Server Component
          }
        },
      },
    }
  );
}

/**
 * Get tenant context from headers or query params
 * Cached per-request using React cache()
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  // 1. Get authenticated user
  const supabase = createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  // 2. Get workspaceId from headers (set by middleware or API wrapper)
  const headersList = await headers();
  const workspaceId = headersList.get('x-workspace-id');

  if (!workspaceId) {
    throw new ValidationError('Workspace ID required');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(workspaceId)) {
    throw new ValidationError('Invalid workspace ID format');
  }

  // 3. Validate workspace membership and get role
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    throw new ForbiddenError('No access to this workspace');
  }

  const workspace: Workspace = {
    id: membership.workspace.id,
    name: membership.workspace.name,
    baseCurrency: membership.workspace.baseCurrency,
  };

  return {
    user,
    workspaceId,
    workspace,
    role: membership.role as WorkspaceRole,
  };
});

/**
 * Get tenant context from request URL (for API routes)
 * Uses query param or header for workspaceId
 */
export const getTenantContextFromRequest = cache(
  async (request: Request): Promise<TenantContext> => {
    // 1. Get authenticated user
    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError('Not authenticated');
    }

    // 2. Get workspaceId from query params or headers
    const url = new URL(request.url);
    let workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      const headersList = await headers();
      workspaceId = headersList.get('x-workspace-id');
    }

    if (!workspaceId) {
      throw new ValidationError('Workspace ID required');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(workspaceId)) {
      throw new ValidationError('Invalid workspace ID format');
    }

    // 3. Validate workspace membership and get role
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership) {
      throw new ForbiddenError('No access to this workspace');
    }

    const workspace: Workspace = {
      id: membership.workspace.id,
      name: membership.workspace.name,
      baseCurrency: membership.workspace.baseCurrency,
    };

    return {
      user,
      workspaceId,
      workspace,
      role: membership.role as WorkspaceRole,
    };
  }
);

/**
 * Check if user has a specific permission
 * Uses centralized permission definitions from ./permissions.ts
 */
export function hasPermission(role: WorkspaceRole, permission: string): boolean {
  return roleHasPermission(role, permission);
}

export function requirePermission(ctx: TenantContext, permission: string): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError(`Permission denied: ${permission}`);
  }
}
