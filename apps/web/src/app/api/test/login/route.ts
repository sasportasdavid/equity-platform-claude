import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * PR #44 B3 — Route bypass auth pour tests E2E (DEV ONLY).
 *
 * 5 couches de défense en profondeur (toutes doivent passer pour 200) :
 *
 *   Couche 1 — VERCEL_ENV !== 'production' → 404
 *              Bloque toute exposition prod Vercel (canalisation native).
 *   Couche 2 — NODE_ENV !== 'production' → 404
 *              Redondance Next.js (en dev/test/preview, pass).
 *   Couche 3 — Header `x-test-secret` matche `E2E_BYPASS_SECRET` env var → 401
 *              Authentifie les tests (secret partagé GitHub Actions ↔ helper).
 *   Couche 4 — `user_profiles.is_test_user = true` → 403
 *              DB-level guard, ne peut être TRUE qu'après seed migration 99000.
 *   Couche 5 — Email pattern `@capiwise-qa.test` → 403
 *              Dernière barrière de namespace.
 *
 * En prod (Vercel `production` env), couches 1+2 bloquent → 404 immédiat.
 * Les couches 3-5 ne sont que defense-in-depth si `E2E_BYPASS_SECRET` était
 * mal configuré en prod par accident (cf docs/QA_SETUP.md §Sécurité).
 *
 * On retourne TOUJOURS un 404 plain text en prod (pas de leak info-disclosure
 * via JSON parse hint sur l'existence du endpoint).
 *
 * Cf docs/QA_SETUP.md pour la configuration env Vercel + setup local.
 */

export async function POST(request: NextRequest) {
  // === Couche 1 : Vercel production env ===
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  // === Couche 2 : Node production env (redondance) ===
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  // === Couche 3 : header secret ===
  const secretHeader = request.headers.get('x-test-secret');
  const expectedSecret = process.env.E2E_BYPASS_SECRET;
  if (!expectedSecret || secretHeader !== expectedSecret) {
    return NextResponse.json({ error: 'Invalid test secret' }, { status: 401 });
  }

  // === Parse body ===
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const email = (body as { email?: unknown })?.email;
  if (typeof email !== 'string' || email.length === 0) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  // === Couche 5 : pattern email (avant DB pour économiser un round-trip) ===
  if (!email.endsWith('@capiwise-qa.test')) {
    return NextResponse.json({ error: 'Test emails only' }, { status: 403 });
  }

  // === DB lookup ===
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // is_test_user vient de la migration 99000. Cast `unknown` car les types
  // DB générés ne sont peut-être pas encore régénérés post-99000.
  const profileQuery = (await supabase
    .from('user_profiles')
    .select('id, is_test_user' as '*')
    .eq('email', email)
    .maybeSingle()) as unknown as {
    data: { id: string; is_test_user: boolean | null } | null;
    error: unknown;
  };

  if (!profileQuery.data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // === Couche 4 : flag is_test_user ===
  if (!profileQuery.data.is_test_user) {
    return NextResponse.json({ error: 'User is not a test user' }, { status: 403 });
  }

  // === Generate magic link sans envoyer l'email (Playwright clique dessus) ===
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${baseUrl}/dashboard`,
    },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: linkErr?.message ?? 'Magic link generation failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    user_id: profileQuery.data.id,
    action_link: linkData.properties.action_link,
  });
}
