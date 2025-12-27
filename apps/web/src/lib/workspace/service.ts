import { prisma, seedWorkspaceCategories } from '@moneio/db';

import type { WorkspaceRole } from './rbac';

interface CreateWorkspaceInput {
  name: string;
  baseCurrency?: string;
  locale?: string;
  ownerId: string;
}

/**
 * Create a new workspace with the creator as owner
 */
export async function createWorkspace({
  name,
  baseCurrency = 'EUR',
  locale = 'en',
  ownerId,
}: CreateWorkspaceInput) {
  const workspace = await prisma.workspace.create({
    data: {
      name,
      baseCurrency,
      locale,
      members: {
        create: {
          userId: ownerId,
          role: 'owner',
        },
      },
    },
    include: {
      members: true,
    },
  });

  // Seed default categories
  try {
    await seedWorkspaceCategories(workspace.id);
  } catch (e) {
    console.error('Failed to seed categories:', e);
    // Continue anyway - categories can be added later
  }

  return workspace;
}

/**
 * Get all workspaces for a user
 */
export async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return memberships.map((m: (typeof memberships)[number]) => ({
    ...m.workspace,
    role: m.role as WorkspaceRole,
  }));
}

/**
 * Get a specific workspace with user's role
 */
export async function getWorkspace(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    return null;
  }

  return {
    ...membership.workspace,
    role: membership.role as WorkspaceRole,
  };
}

/**
 * Update workspace settings
 */
export async function updateWorkspace(
  workspaceId: string,
  data: { name?: string; baseCurrency?: string; locale?: string }
) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data,
  });
}
