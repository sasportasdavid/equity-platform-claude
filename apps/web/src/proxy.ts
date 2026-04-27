import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next 16 proxy (anciennement `middleware.ts`).
 *
 * Pipeline :
 *  1. Refresh la session Supabase à chaque requête (cookies refresh).
 *  2. Routes publiques (/, /login, /accept-invite, /auth/callback,
 *     /api/webhooks/*) → passe-droit complet.
 *  3. Utilisateur anon sur route privée → redirect /login?redirectTo=...
 *  4. Utilisateur authentifié sur /login → redirect /dashboard.
 *  5. Utilisateur authentifié sans `app_metadata.active_org_id` :
 *     - sur /onboarding/* ou /select-org : on laisse passer (c'est là qu'il
 *       va régler ce problème)
 *     - sinon : redirect /onboarding/create-org si zéro membership probable,
 *       /select-org si ≥1 membership (c'est l'app qui décidera précisément
 *       côté SSR via requireUser).
 *
 * Notes Next 16 :
 *  - Filename = `proxy.ts` (le legacy `middleware.ts` reste supporté mais
 *    déprécié). Runtime nodejs (edge non supporté ici).
 *  - Le `proxy` ne peut pas appeler la DB directement de manière propre :
 *    on lit uniquement le JWT (via getUser + app_metadata) pour décider.
 */

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/accept-invite',
  '/auth/callback',
  '/unauthorized',
  '/no-access',
]);

const PUBLIC_PREFIXES = ['/api/webhooks/', '/_next/', '/favicon', '/static/'];

/** Routes accessibles à un user authentifié SANS active_org_id. */
const NO_ORG_ALLOWED_PREFIXES = ['/onboarding', '/select-org'];

/** Routes d'erreur disponibles à tout user authentifié. */
const ERROR_ROUTES = new Set(['/unauthorized', '/no-access']);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isNoOrgAllowed(pathname: string): boolean {
  if (ERROR_ROUTES.has(pathname)) return true;
  return NO_ORG_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
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
  const activeOrgId =
    (user?.app_metadata as { active_org_id?: string } | null)?.active_org_id ?? null;

  // Authed user qui visite /login → /dashboard ou /onboarding selon contexte
  if (isAuthed && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = activeOrgId ? '/dashboard' : '/onboarding/create-org';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Anon sur route privée → /login?redirectTo=...
  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Authed sans org active sur route business → onboarding
  if (isAuthed && !activeOrgId && !isPublic && !isNoOrgAllowed(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding/create-org';
    url.search = '';
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
