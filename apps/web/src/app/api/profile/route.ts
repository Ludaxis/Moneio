import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { ensureUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function GET() {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUser(user.id, user.email || undefined);

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Failed to load profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await ensureUser(user.id, user.email || undefined);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        avatarUrl: parsed.data.avatarUrl,
      },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
