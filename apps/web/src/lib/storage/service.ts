import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DOCUMENTS_BUCKET = 'documents';

// Lazy initialization of Supabase admin client
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase environment variables not configured');
    }
    supabaseAdmin = createClient(url, key);
  }
  return supabaseAdmin;
}

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
  _mimeType: string
): Promise<SignedUploadResult> {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${workspaceId}/${timestamp}_${sanitizedFileName}`;

  const { data, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
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
export async function createSignedReadUrl(path: string, expiresIn: number = 3600): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
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
  const { error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

export interface FileMetadata {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get file metadata from storage
 */
export async function getFileMetadata(path: string): Promise<FileMetadata | null> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
    .list(path.split('/').slice(0, -1).join('/'), {
      search: path.split('/').pop(),
    });

  if (error) {
    throw new Error(`Failed to get metadata: ${error.message}`);
  }

  const file = data?.[0];
  if (!file) return null;

  return {
    name: file.name,
    id: file.id,
    updated_at: file.updated_at,
    created_at: file.created_at,
    last_accessed_at: file.last_accessed_at,
    metadata: file.metadata as Record<string, unknown> | undefined,
  };
}
