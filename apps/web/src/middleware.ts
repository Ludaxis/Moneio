import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';

import { locales, defaultLocale } from './lib/i18n';

// Pages that don't require authentication
const publicPages = ['/login', '/signup', '/forgot-password', '/'];
const localePattern = `(${locales.join('|')})`;
const localeRegex = new RegExp(`^/${localePattern}`);

// Create intl middleware
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

// Check if Supabase is configured
const isSupabaseConfigured = () => {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
};

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets/icons entirely - they should never go through middleware
  if (
    pathname.includes('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/manifest')
  ) {
    return NextResponse.next();
  }

  // Rewrite localized asset/public requests back to root (e.g., /fa/favicon.ico -> /favicon.ico)
  const assetMatch = pathname.match(/^\/(en|et|fa|ar)\/(.*\.[^/]+)$/);
  if (assetMatch) {
    const rest = assetMatch[2];
    return NextResponse.rewrite(new URL(`/${rest}`, request.url));
  }

  // Skip auth routes and API routes
  if (pathname.startsWith('/auth/') || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // If Supabase is not configured, skip auth and just apply intl middleware
  if (!isSupabaseConfigured()) {
    return intlMiddleware(request);
  }

  // Create Supabase client for session refresh
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if this is a public page
  const pathnameWithoutLocale = pathname.replace(localeRegex, '') || '/';
  const isPublicPage = publicPages.some((page) =>
    page === '/' ? pathnameWithoutLocale === '/' : pathnameWithoutLocale.startsWith(page)
  );

  // Redirect to login if not authenticated and not on a public page
  if (!user && !isPublicPage) {
    const locale = pathname.match(localeRegex)?.[1] || defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to dashboard if authenticated and on login page
  if (user && pathnameWithoutLocale === '/login') {
    const locale = pathname.match(localeRegex)?.[1] || defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  // Apply intl middleware
  const intlResponse = intlMiddleware(request);

  // Merge cookies from Supabase response
  response.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie);
  });

  return intlResponse;
}

export const config = {
  matcher: [
    // Match root
    '/',
    // Match localized paths (en, et, fa, ar) but exclude _next, api, auth, and static files
    '/(en|et|fa|ar)/((?!_next|api|auth|.*\\..*).*)',
    // Match non-localized paths excluding _next, api, auth, and static files
    '/((?!_next|api|auth|.*\\..*).*)',
  ],
};
