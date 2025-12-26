import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { ensureUserExists } from '@/lib/auth/user-bootstrap';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Bootstrap user in our database
      try {
        await ensureUserExists(data.user);
      } catch (e) {
        console.error('Failed to bootstrap user:', e);
        // Continue anyway - user will be created on next request
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
