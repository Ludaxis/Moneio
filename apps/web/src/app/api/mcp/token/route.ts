import crypto from 'crypto';

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Generate a signed token for MCP access
// Token contains workspaceId and expires in 1 hour

const SECRET = process.env.MCP_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || 'mcp-secret-key';

function signToken(data: { workspaceId: string; userId: string; expiresAt: number }): string {
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const token = Buffer.from(payload).toString('base64') + '.' + signature;
  return token;
}

export function verifyToken(token: string): { workspaceId: string; userId: string } | null {
  try {
    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature) return null;

    const payload = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

    if (signature !== expectedSignature) return null;

    const data = JSON.parse(payload);
    if (data.expiresAt < Date.now()) return null;

    return { workspaceId: data.workspaceId, userId: data.userId };
  } catch {
    return null;
  }
}

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
    const token = signToken({
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
