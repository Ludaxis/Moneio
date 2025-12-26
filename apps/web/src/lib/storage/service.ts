import { createClient } from '@supabase/supabase-js';

// Create admin client for storage operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DOCUMENTS_BUCKET = 'documents';

export interface SignedUploadResult {
  signedUrl: string;
  path: string;
  token: string;
}

/**
 * Generate a signed upload URL for document upload
 */
export async function createSignedUploadUrl(
  workspaceId: string,
  fileName: string,
  mimeType: string
): Promise<SignedUploadResult> {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${workspaceId}/${timestamp}_${sanitizedFileName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    throw new Error(`Failed to create upload URL: ${error.message}`);
  }

  return {
    signedUrl: data.signedUrl,
    path: data.path,
    token: data.token,
  };
}

/**
 * Generate a signed read URL for a document
 */
export async function createSignedReadUrl(
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Failed to create read URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Delete a document from storage
 */
export async function deleteFromStorage(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Get file metadata from storage
 */
export async function getFileMetadata(path: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .list(path.split('/').slice(0, -1).join('/'), {
      search: path.split('/').pop(),
    });

  if (error) {
    throw new Error(`Failed to get metadata: ${error.message}`);
  }

  return data?.[0] || null;
}
