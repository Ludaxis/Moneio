import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import {
  addWorkspaceMember,
  getUserRole,
  listWorkspaceMembers,
  type WorkspaceRole,
} from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure the requester is a member
    const role = await getUserRole(user.id, params.id);
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const members = await listWorkspaceMembers(params.id);
    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        createdAt: m.createdAt,
        isCurrentUser: m.userId === user.id,
      })),
    });
  } catch (error) {
    console.error('Failed to list members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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

    // Only owner/admin can manage members
    if (actorRole !== 'owner' && actorRole !== 'admin') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;

    // Only owners can invite another owner
    if (role === 'owner' && actorRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can add another owner' }, { status: 403 });
    }

    const member = await addWorkspaceMember(params.id, email, role as WorkspaceRole);

    return NextResponse.json(
      {
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        name: member.user.name,
        role: member.role,
        createdAt: member.createdAt,
        isCurrentUser: member.userId === user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to add member:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'User not found' || message.includes('already a member') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
