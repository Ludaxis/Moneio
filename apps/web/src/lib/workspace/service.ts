import { prisma, seedWorkspaceCategories } from '@moneio/db';

import type { WorkspaceRole } from './rbac';

interface CreateWorkspaceInput {
  name: string;
  baseCurrency?: string;
  locale?: string;
  ownerId: string;
  ownerEmail?: string;
}

interface MemberWithUser {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
  user: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
}

/**
 * Ensure a user exists in the database (upsert from Supabase Auth)
 */
export async function ensureUser(userId: string, email?: string) {
  return prisma.user.upsert({
    where: { id: userId },
    update: {}, // Don't update existing users
    create: {
      id: userId,
      email: email || `user-${userId}@moneio.app`,
    },
  });
}

/**
 * Create a new workspace with the creator as owner
 */
export async function createWorkspace({
  name,
  baseCurrency = 'EUR',
  locale = 'en',
  ownerId,
  ownerEmail,
}: CreateWorkspaceInput) {
  // Ensure the user exists in our database first
  await ensureUser(ownerId, ownerEmail);

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
  data: { name?: string; baseCurrency?: string; locale?: string; calendarSystem?: string }
) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data,
  });
}

/**
 * Delete a workspace and all its data
 * Only the owner can delete a workspace
 */
export async function deleteWorkspace(workspaceId: string) {
  // Cascade delete is configured in Prisma schema
  return prisma.workspace.delete({
    where: { id: workspaceId },
  });
}

/**
 * List members with user info for a workspace
 */
export async function listWorkspaceMembers(workspaceId: string): Promise<MemberWithUser[]> {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: {
          email: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  }) as unknown as MemberWithUser[];
}

/**
 * Add a member by email (user must already exist)
 */
export async function addWorkspaceMember(
  workspaceId: string,
  email: string,
  role: WorkspaceRole
): Promise<MemberWithUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('User not found');
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (existing) {
    throw new Error('User is already a member of this workspace');
  }

  const member = await prisma.workspaceMember.create({
    data: {
      workspaceId,
      userId: user.id,
      role,
    },
    include: {
      user: {
        select: {
          email: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  return member as unknown as MemberWithUser;
}

/**
 * Update a member's role
 */
export async function updateWorkspaceMemberRole(
  memberId: string,
  role: WorkspaceRole
): Promise<MemberWithUser> {
  const member = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role },
    include: {
      user: { select: { email: true, name: true, avatarUrl: true } },
    },
  });

  return member as unknown as MemberWithUser;
}

/**
 * Remove a workspace member
 */
export async function removeWorkspaceMember(memberId: string) {
  return prisma.workspaceMember.delete({
    where: { id: memberId },
  });
}
