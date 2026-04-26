import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next 16 proxy (anciennement `middleware`).
 *
 * Rôles :
 *  1. Rafraîchir la session Supabase à chaque requête (cookies refresh).
 *  2. Rediriger vers /login les utilisateurs non authentifiés sur les routes
 *     privées (groupes (dashboard), (beneficiary), (auditor) et /api/* hors
 *     webhooks).
 *  3. Rediriger vers /dashboard les utilisateurs déjà connectés qui visitent
 *     /login.
 *
 * Notes Next 16 :
 *  - Le runtime du proxy est nodejs (l'edge runtime n'est plus supporté ici).
 *  - Le filename est `proxy.ts`, pas `middleware.ts` (changement v16).
 */

const PUBLIC_ROUTES = new Set(['/', '/login', '/signup', '/forgot-password', '/reset-password']);
const PUBLIC_PREFIXES = ['/api/webhooks/', '/_next/', '/favicon', '/static/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthed = Boolean(user);
  const isPublic = isPublicPath(pathname);

  // Logged-in users sur /login → /dashboard
  if (isAuthed && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Utilisateurs anonymes sur route privée → /login
  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match toutes les routes sauf :
     *  - _next/static, _next/image, favicon
     *  - tous les fichiers avec extension (images, fonts, sw.js, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)',
  ],
};
