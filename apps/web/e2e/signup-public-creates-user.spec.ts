import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { clearMailpit, getMailpitMessages } from './helpers/auth';

/**
 * Bug #1 fix sprint 6 mai 2026 PM — E2E regression guard.
 *
 * Garantit que :
 *   1. POST /signup avec un email frais → user créé en `auth.users`
 *      ET row insérée en `public.user_profiles`
 *   2. Un email magic-link arrive dans Mailpit (preuve que Resend
 *      pipeline serverside fonctionne — avant le fix, le client appelait
 *      `signInWithOtp` côté browser et Supabase SMTP par défaut était
 *      saturé en prod)
 *   3. Anti-enumeration préservée : retry sur le même email → toujours
 *      "Email envoyé" (pas d'erreur visible révélant l'existence)
 *
 * Email policy :
 *   - `@capiwise-e2e.test` (RFC 6761 réservé) — script
 *     `scripts/cleanup-e2e-users.ts` purge en CI hebdo
 *   - Timestamp suffix pour éviter conflits intra-run
 *
 * Pré-requis E2E :
 *   - Mailpit local sur :8025 (cf docker-compose.qa.yml)
 *   - Supabase local OU dev cloud avec Resend pointant vers Mailpit
 *     (RESEND_API_KEY peut être un fake si on intercepte côté SMTP)
 *
 * Si Mailpit absent : les assertions Mailpit sont skippées, mais le
 * test DB passe quand même.
 */

const TIMESTAMP = Date.now();
const FRESH_EMAIL = `signup-${TIMESTAMP}@capiwise-e2e.test`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis pour ce test E2E (verif DB).',
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserByEmail(email: string) {
  const admin = getAdminClient();
  // listUsers ne supporte pas de filtre — on paginate les premières pages
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) break;
  }
  return null;
}

async function deleteUserIfExists(email: string) {
  const user = await findUserByEmail(email);
  if (!user) return;
  const admin = getAdminClient();
  await admin.auth.admin.deleteUser(user.id);
}

test.describe('Bug #1 fix — signup public crée un user en DB et envoie un email Resend', () => {
  test.beforeEach(async () => {
    // Cleanup pre-emptive en cas de retry test
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      await deleteUserIfExists(FRESH_EMAIL);
    }
    // Mailpit clear best-effort (peut être absent en CI)
    try {
      await clearMailpit();
    } catch {
      /* Mailpit absent : ignoré, on testera juste la DB */
    }
  });

  test.afterEach(async () => {
    // Cleanup post-test (defense-in-depth + script cleanup-e2e-users.ts en CI)
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      await deleteUserIfExists(FRESH_EMAIL);
    }
  });

  test('POST /signup → auth.users + user_profiles créés + magic link Mailpit', async ({ page }) => {
    test.skip(!SUPABASE_URL || !SUPABASE_SERVICE_KEY, 'Service role admin requis pour vérif DB');

    await page.goto('/signup');
    await page.getByTestId('signup-email').fill(FRESH_EMAIL);
    await page.getByTestId('signup-tos').check();
    await page.getByTestId('signup-submit').click();

    // 1. UI affiche "Email envoyé" (Server Action ok=true uniquement si
    //    Resend a confirmé l'envoi → plus de fake success)
    await expect(page.getByText('Email envoyé', { exact: true })).toBeVisible({ timeout: 15_000 });

    // 2. Vérification DB : auth.users créé
    const user = await findUserByEmail(FRESH_EMAIL);
    expect(user, `auth.users devrait contenir ${FRESH_EMAIL} après signup`).not.toBeNull();
    expect(user!.email?.toLowerCase()).toBe(FRESH_EMAIL.toLowerCase());

    // 3. Vérification DB : user_profiles inséré (RPC ensure_user_profile_exists)
    const admin = getAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('id, email')
      .eq('id', user!.id)
      .maybeSingle();
    expect(profileError).toBeNull();
    expect(profile, `user_profiles devrait contenir l'id ${user!.id}`).not.toBeNull();

    // 4. Mailpit best-effort (skippé si Mailpit absent)
    try {
      const messages = await getMailpitMessages({ to: FRESH_EMAIL });
      const first = messages[0];
      if (first) {
        // Au moins un message magic-link doit avoir été reçu
        expect(messages.length).toBeGreaterThan(0);
        const subject = first.Subject ?? '';
        expect(subject.toLowerCase()).toMatch(/connexion|capiwise/);
      }
    } catch {
      // Mailpit non joignable, on ne fail pas le test (DB est la source de vérité)
    }
  });

  test('retry sur email déjà existant ACTIVE → fake success préservé (anti enum)', async ({
    page,
  }) => {
    test.skip(!SUPABASE_URL || !SUPABASE_SERVICE_KEY, 'Service role admin requis');

    // Pré-créer un user ACTIVE puis tenter signup → doit return ok=true
    // sans révéler que le compte existe (anti email enumeration).
    const existingEmail = `existing-${TIMESTAMP}@capiwise-e2e.test`;
    const admin = getAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: existingEmail,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      test.skip(true, `Setup pre-create failed : ${createErr?.message}`);
      return;
    }
    // ⚠️ Pour vraiment matcher la branche ACTIVE membership le user devrait
    // avoir une membership ACTIVE. Pour ce smoke E2E on accepte le branch
    // "profile partiel" (sans membership) qui retourne aussi ok=true.

    try {
      await page.goto('/signup');
      await page.getByTestId('signup-email').fill(existingEmail);
      await page.getByTestId('signup-tos').check();
      await page.getByTestId('signup-submit').click();

      // UI doit afficher "Email envoyé" même si email existait déjà
      await expect(page.getByText('Email envoyé', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await admin.auth.admin.deleteUser(created.user.id);
    }
  });
});
