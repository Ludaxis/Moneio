import type { DocumentStatus } from '@moneio/db';
import { SUPPORTED_DOCUMENT_MIME_TYPES } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createDocument, getWorkspaceDocuments } from '@/lib/documents';
import { enqueueDocNormalize } from '@/lib/queue';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const createDocumentSchema = z.object({
  workspaceId: z.string().uuid(),
  fileName: z.string().min(1).max(512),
  mimeType: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (value) =>
        SUPPORTED_DOCUMENT_MIME_TYPES.includes(
          value as (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number]
        ),
      {
        message: 'Unsupported MIME type',
      }
    ),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  storagePath: z.string().min(1).max(1024),
});

export async function GET(request: Request) {
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
    const limit = parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const statusParam = searchParams.get('status');

    if (!workspaceId || !z.string().uuid().safeParse(workspaceId).success) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check permission
    const canRead = await hasPermission(user.id, workspaceId, 'document:read');
    if (!canRead) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Validate status if provided
    const validStatuses = [
      'uploaded',
      'processing',
      'ocr_complete',
      'extracting',
      'ready',
      'failed',
    ];
    const status = statusParam && validStatuses.includes(statusParam) ? statusParam : undefined;

    const result = await getWorkspaceDocuments(workspaceId, {
      limit,
      offset,
      status: status as DocumentStatus | undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to get documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 256 * 1024) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createDocumentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { workspaceId, fileName, mimeType, fileSize, storagePath } = parsed.data;

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
    await enqueueDocNormalize({
      documentId: document.id,
      workspaceId,
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Failed to create document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
