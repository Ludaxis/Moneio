import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DOCUMENTS_BUCKET = 'documents';

// Lazy initialization of Supabase client
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabase;
}

/**
 * Download a file from Supabase storage
 */
export async function downloadFile(storagePath: string): Promise<Buffer> {
  const { data, error } = await getSupabase().storage.from(DOCUMENTS_BUCKET).download(storagePath);

  if (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Upload a file to Supabase storage
 */
export async function uploadFile(
  storagePath: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await getSupabase().storage.from(DOCUMENTS_BUCKET).upload(storagePath, data, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return storagePath;
}

/**
 * Get a signed URL for reading a file
 */
export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}
