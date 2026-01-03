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
import { cache } from 'react';

import { UnauthorizedError, ForbiddenError, ValidationError } from './errors';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

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
 */
const rolePermissions: Record<WorkspaceRole, string[]> = {
  owner: [
    'workspace:read',
    'workspace:update',
    'workspace:delete',
    'workspace:invite',
    'workspace:manage_members',
    'document:read',
    'document:create',
    'document:update',
    'document:delete',
    'document:approve',
    'invoice:read',
    'invoice:create',
    'invoice:update',
    'invoice:delete',
    'invoice:approve',
    'transaction:read',
    'transaction:create',
    'transaction:update',
    'transaction:delete',
    'transaction:categorize',
    'transaction:approve',
    'report:read',
    'report:export',
    'settings:read',
    'settings:update',
    'category:read',
    'category:create',
    'category:update',
    'category:delete',
    'rule:read',
    'rule:create',
    'rule:update',
    'rule:delete',
    'gl:read',
    'gl:create',
    'gl:update',
    'gl:delete',
    'gl:post',
    'gl:close',
  ],
  admin: [
    'workspace:read',
    'workspace:update',
    'workspace:invite',
    'document:read',
    'document:create',
    'document:update',
    'document:delete',
    'document:approve',
    'invoice:read',
    'invoice:create',
    'invoice:update',
    'invoice:delete',
    'invoice:approve',
    'transaction:read',
    'transaction:create',
    'transaction:update',
    'transaction:delete',
    'transaction:categorize',
    'transaction:approve',
    'report:read',
    'report:export',
    'settings:read',
    'category:read',
    'category:create',
    'category:update',
    'category:delete',
    'rule:read',
    'rule:create',
    'rule:update',
    'rule:delete',
    'gl:read',
    'gl:create',
    'gl:update',
    'gl:delete',
    'gl:post',
  ],
  member: [
    'workspace:read',
    'document:read',
    'document:create',
    'document:update',
    'invoice:read',
    'invoice:create',
    'invoice:update',
    'transaction:read',
    'transaction:categorize',
    'report:read',
    'settings:read',
    'category:read',
    'rule:read',
    'gl:read',
  ],
};

export function hasPermission(role: WorkspaceRole, permission: string): boolean {
  const permissions = rolePermissions[role] || [];
  return permissions.includes(permission);
}

export function requirePermission(ctx: TenantContext, permission: string): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new ForbiddenError(`Permission denied: ${permission}`);
  }
}
