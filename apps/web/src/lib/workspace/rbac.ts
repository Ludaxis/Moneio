import { prisma } from '@moneio/db';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

// Permission definitions by role
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

/**
 * Check if a user has a specific permission in a workspace
 */
export async function hasPermission(
  userId: string,
  workspaceId: string,
  permission: string
): Promise<boolean> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (!membership) {
    return false;
  }

  const role = membership.role as WorkspaceRole;
  const permissions = rolePermissions[role] || [];

  return permissions.includes(permission);
}

/**
 * Get user's role in a workspace
 */
export async function getUserRole(
  userId: string,
  workspaceId: string
): Promise<WorkspaceRole | null> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  return membership ? (membership.role as WorkspaceRole) : null;
}

/**
 * Check if user is at least admin
 */
export async function isAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const role = await getUserRole(userId, workspaceId);
  return role === 'owner' || role === 'admin';
}

/**
 * Check if user is owner
 */
export async function isOwner(userId: string, workspaceId: string): Promise<boolean> {
  const role = await getUserRole(userId, workspaceId);
  return role === 'owner';
}

/**
 * Get permissions for a role
 */
export function getPermissionsForRole(role: WorkspaceRole): string[] {
  return rolePermissions[role] || [];
}

/**
 * Require permission (throws if not authorized)
 */
export async function requirePermission(
  userId: string,
  workspaceId: string,
  permission: string
): Promise<void> {
  const allowed = await hasPermission(userId, workspaceId, permission);
  if (!allowed) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
