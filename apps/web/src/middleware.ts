import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';

import { locales, defaultLocale } from './lib/i18n';

// Pages that don't require authentication
const publicPages = ['/login', '/signup', '/forgot-password'];

// Create intl middleware
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth routes and API routes
  if (pathname.startsWith('/auth/') || pathname.startsWith('/api/')) {
    return NextResponse.next();
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
  const pathnameWithoutLocale = pathname.replace(/^\/(en|et|fa|ar)/, '') || '/';
  const isPublicPage = publicPages.some((page) => pathnameWithoutLocale.startsWith(page));

  // Redirect to login if not authenticated and not on a public page
  if (!user && !isPublicPage) {
    const locale = pathname.match(/^\/(en|et|fa|ar)/)?.[1] || defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to dashboard if authenticated and on login page
  if (user && pathnameWithoutLocale === '/login') {
    const locale = pathname.match(/^\/(en|et|fa|ar)/)?.[1] || defaultLocale;
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
  matcher: ['/', '/(en|et|fa|ar)/:path*', '/((?!_next|api|auth|.*\\..*).*)'],
};
