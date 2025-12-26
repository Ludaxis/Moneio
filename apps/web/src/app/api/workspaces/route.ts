import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { createWorkspace, getUserWorkspaces } from '@/lib/workspace';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaces = await getUserWorkspaces(user.id);
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Failed to get workspaces:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, baseCurrency, locale } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const workspace = await createWorkspace({
      name,
      baseCurrency: baseCurrency || 'EUR',
      locale: locale || 'en',
      ownerId: user.id,
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    console.error('Failed to create workspace:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
