import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { signMcpToken } from '@/lib/mcp-auth';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { workspaceId } = await request.json();

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to this workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'No access to workspace' }, { status: 403 });
    }

    // Generate signed token (expires in 1 hour)
    const token = signMcpToken({
      workspaceId,
      userId: user.id,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error('[MCP Token] Error:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
