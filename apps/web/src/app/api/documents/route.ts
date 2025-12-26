import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { createDocument, getWorkspaceDocuments } from '@/lib/documents';
import { hasPermission } from '@/lib/workspace';

// Stub for queue - will be implemented in T09
async function enqueueDocNormalize(documentId: string) {
  console.log(`[QUEUE STUB] DOC_NORMALIZE queued for document: ${documentId}`);
  // TODO: Implement with BullMQ in T09
}

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'document:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const result = await getWorkspaceDocuments(workspaceId, { limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to get documents:', error);
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
    const { workspaceId, fileName, mimeType, fileSize, storagePath } = body;

    if (!workspaceId || !fileName || !mimeType || !fileSize || !storagePath) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check permission
    const canCreate = await hasPermission(user.id, workspaceId, 'document:create');
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const document = await createDocument({
      workspaceId,
      fileName,
      mimeType,
      fileSize,
      storagePath,
    });

    // Enqueue for processing
    await enqueueDocNormalize(document.id);

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Failed to create document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
