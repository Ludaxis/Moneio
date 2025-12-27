import { NextResponse } from 'next/server';

import { getDocument, getDocumentViewUrl } from '@/lib/documents';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'document:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const document = await getDocument(params.id, workspaceId);

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get signed URL for viewing
    const viewUrl = await getDocumentViewUrl(params.id, workspaceId);

    return NextResponse.json({
      document,
      viewUrl,
    });
  } catch (error) {
    console.error('Failed to get document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
