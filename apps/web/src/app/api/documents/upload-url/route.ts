import { NextResponse } from 'next/server';

import { createSignedUploadUrl } from '@/lib/storage';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, fileName, mimeType } = body;

    if (!workspaceId || !fileName || !mimeType) {
      return NextResponse.json(
        { error: 'workspaceId, fileName, and mimeType are required' },
        { status: 400 }
      );
    }

    // Check permission
    const canUpload = await hasPermission(user.id, workspaceId, 'document:create');
    if (!canUpload) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const result = await createSignedUploadUrl(workspaceId, fileName, mimeType);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to create upload URL:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
