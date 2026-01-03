import {
  type WorkspaceRole,
  roleHasPermission,
  getPermissionsForRole,
  isAtLeastAdmin,
  isOwnerRole,
} from '@moneio/app-services';
import { prisma } from '@moneio/db';

// Re-export for backward compatibility
export type { WorkspaceRole } from '@moneio/app-services';

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
  return roleHasPermission(role, permission);
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
  return role !== null && isAtLeastAdmin(role);
}

/**
 * Check if user is owner
 */
export async function isOwner(userId: string, workspaceId: string): Promise<boolean> {
  const role = await getUserRole(userId, workspaceId);
  return role !== null && isOwnerRole(role);
}

// Re-export getPermissionsForRole from app-services
export { getPermissionsForRole };

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
