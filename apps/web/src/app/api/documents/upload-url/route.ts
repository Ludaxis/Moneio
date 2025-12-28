import { SUPPORTED_DOCUMENT_MIME_TYPES } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createSignedUploadUrl } from '@/lib/storage';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const MAX_FILE_NAME_LENGTH = 512;
const uploadUrlSchema = z.object({
  workspaceId: z.string().uuid(),
  fileName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
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
});

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 128 * 1024) {
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
    const parsed = uploadUrlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { workspaceId, fileName, mimeType } = parsed.data;

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
