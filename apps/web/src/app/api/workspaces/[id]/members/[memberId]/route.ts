import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import {
  getUserRole,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspaceRole,
} from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const updateRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
});

async function ensureNotLastOwner(workspaceId: string, memberId: string) {
  const target = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
  });
  if (target?.role !== 'owner') return;

  const ownerCount = await prisma.workspaceMember.count({
    where: { workspaceId, role: 'owner' },
  });

  if (ownerCount <= 1) {
    throw new Error('Cannot remove the last owner');
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actorRole = await getUserRole(user.id, params.id);
    if (!actorRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only owners/admins can update roles
    if (actorRole !== 'owner' && actorRole !== 'admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const target = await prisma.workspaceMember.findUnique({
      where: { id: params.memberId },
    });

    if (!target || target.workspaceId !== params.id) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Only owners can promote/demote owners
    if ((target.role === 'owner' || parsed.data.role === 'owner') && actorRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can change owner roles' }, { status: 403 });
    }

    if (target.role === 'owner' && parsed.data.role !== 'owner') {
      await ensureNotLastOwner(params.id, params.memberId);
    }

    const updated = await updateWorkspaceMemberRole(
      params.memberId,
      parsed.data.role as WorkspaceRole
    );

    return NextResponse.json({
      id: updated.id,
      userId: updated.userId,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role,
      createdAt: updated.createdAt,
      isCurrentUser: updated.userId === user.id,
    });
  } catch (error) {
    console.error('Failed to update member role:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Cannot remove') ? 400 : 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actorRole = await getUserRole(user.id, params.id);
    if (!actorRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (actorRole !== 'owner' && actorRole !== 'admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const target = await prisma.workspaceMember.findUnique({
      where: { id: params.memberId },
    });

    if (!target || target.workspaceId !== params.id) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (target.role === 'owner' && actorRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can remove an owner' }, { status: 403 });
    }

    await ensureNotLastOwner(params.id, params.memberId);

    await removeWorkspaceMember(params.memberId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove member:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Cannot remove') ? 400 : 500 }
    );
  }
}
