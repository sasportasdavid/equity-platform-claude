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
 *     - sinon : redirect /select-org. Cette page SSR lit `memberships` via
 *       admin client et décide :
 *         * 0 membership → redirige vers /onboarding/create-org
 *         * ≥1 membership → affiche le picker (qui appelle setActiveOrg
 *           pour mettre à jour app_metadata.active_org_id côté DB)
 *       Pourquoi pas redirect direct vers /onboarding/create-org : si le
 *       hook `custom_access_token_hook` est instable (dette #33), un user
 *       qui A bien des memberships était re-routé vers create-org → fix ici.
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
  '/signup',
  '/accept-invite',
  '/auth/callback',
  '/unauthorized',
  '/no-access',
]);

const PUBLIC_PREFIXES = ['/api/webhooks/', '/_next/', '/favicon', '/static/', '/dev/', '/legal/'];

/**
 * Routes accessibles à un user authentifié SANS `active_org_id` dans son JWT.
 *
 * - `/onboarding` + `/select-org` : flows admin pour créer/choisir une org
 * - `/portal` (Module 8) : un BENEFICIARY pur n'a pas forcément d'org membership ;
 *   son contexte org vient de `beneficiaries.org_id` lu côté layout, pas du JWT.
 *   La layout `/portal/*` fait son propre check beneficiary (Module 8 B2).
 */
const NO_ORG_ALLOWED_PREFIXES = ['/onboarding', '/select-org', '/portal'];

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
  // On propage le pathname via header pour que les Server Components puissent
  // y accéder via `headers()`. Utilisé par `app/portal/layout.tsx` pour
  // distinguer les routes onboarding (welcome / profile/setup) des autres
  // routes du portail.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    // `flowType: 'pkce'` aligné avec server.ts et client.ts pour que la
    // session restaurée par le proxy soit cohérente avec celle créée
    // par /auth/callback (sinon désaccord sur le storage du verifier).
    auth: { flowType: 'pkce' },
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

  const onboardingCompleted =
    (user?.app_metadata as { onboarding_completed?: boolean } | null)?.onboarding_completed ===
    true;

  // Authed user qui visite /login ou /signup → /dashboard, /onboarding ou
  // /select-org selon contexte (la page /select-org décidera : redirect
  // /onboarding/company si 0 membership, picker si ≥1)
  if (isAuthed && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    if (!activeOrgId) {
      url.pathname = '/select-org';
    } else if (!onboardingCompleted) {
      url.pathname = '/onboarding';
    } else {
      url.pathname = '/dashboard';
    }
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

  // Authed sans org active sur route business → /select-org (qui décidera
  // d'afficher le picker ou de rediriger vers /onboarding/company si
  // l'user n'a vraiment aucune membership)
  if (isAuthed && !activeOrgId && !isPublic && !isNoOrgAllowed(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/select-org';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Module 14 §B2 — onboarding gate.
  // Si user authed + active_org_id mais onboarding pas complété, force
  // redirect vers /onboarding (sauf si déjà dans /onboarding/* ou /portal
  // ou route publique). Lecture du JWT (`app_metadata.onboarding_completed`)
  // — pas de DB lookup au proxy.
  //
  // /portal autorisé pour les BENEFICIARY purs (Module 8) — l'onboarding
  // wizard cible les admins/operators ; un BENEFICIARY arrive via
  // invitation → flow distinct.
  if (
    isAuthed &&
    activeOrgId &&
    !onboardingCompleted &&
    !isPublic &&
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/portal') &&
    !pathname.startsWith('/api/') &&
    !ERROR_ROUTES.has(pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding';
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
