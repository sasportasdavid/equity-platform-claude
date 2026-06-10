import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { clearMailpit, getMailpitMessages } from './helpers/auth';

/**
 * Pre-launch hardening — E2E magic-link-login (Module 2 / 14).
 *
 * Flow réel via Mailpit : demander un magic link, récupérer l'email dans
 * Mailpit, suivre le lien, vérifier l'arrivée sur une page authentifiée.
 *
 * Choix d'implémentation — quel chemin produit un magic link DANS Mailpit ?
 *   - Le bouton "Recevoir un lien magique" du /login appelle
 *     `supabase.auth.signInWithOtp()` CÔTÉ BROWSER (PKCE) → l'email part via
 *     le SMTP Supabase, PAS via Resend → il N'arrive PAS dans Mailpit en
 *     local (cf. commentaires signup-flow.spec.ts).
 *   - Le SEUL flow UI qui route un magic link via Resend → Mailpit est le
 *     SIGNUP (`signupWithMagicLink` → `admin.generateLink({type:'magiclink'})`
 *     + Resend template `magic_link_login`, sujet "Votre lien de connexion ·
 *     Capiwise"). C'est le pattern validé par signup-public-creates-user.spec.ts.
 *
 * Ce test reproduit donc le flow magic-link réel via signup d'un user frais :
 *   1. clearMailpit + cleanup pré-emptif du user
 *   2. /signup → email + ToS → "Email envoyé"
 *   3. Catcher l'email magic link dans Mailpit (sujet "lien de connexion")
 *   4. Extraire l'actionLink (/auth/callback?...&token_hash=...&type=magiclink)
 *   5. Le suivre → /auth/callback consomme l'OTP et redirige vers une page
 *      authentifiée (un user frais sans org atterrit sur /onboarding ;
 *      le point clé testé = la session est établie, pas un retour /login).
 *
 * Email policy : `@capiwise-e2e.test` (RFC 6761) + timestamp ; cleanup via
 * admin client (comme signup-public-creates-user.spec.ts).
 *
 * Skips propres si Mailpit absent ou service_role non configuré.
 */

const TIMESTAMP = Date.now();
const FRESH_EMAIL = `magiclink-${TIMESTAMP}@capiwise-e2e.test`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

function getAdminClient() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function deleteUserIfExists(email: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  const admin = getAdminClient();
  for (let p = 1; p <= 5; p++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: 100 });
    if (error) return;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      await admin.auth.admin.deleteUser(found.id);
      return;
    }
    if (data.users.length < 100) return;
  }
}

// Le lien d'action pointe vers {APP_URL}/auth/callback?next=...&token_hash=...&type=magiclink
const ACTION_LINK_REGEX = /https?:\/\/[^\s"'<>]*\/auth\/callback[^\s"'<>]*/i;

test.describe('Magic-link login — flow réel via Mailpit (Module 2/14)', () => {
  test.beforeEach(async () => {
    await deleteUserIfExists(FRESH_EMAIL);
    try {
      await clearMailpit();
    } catch {
      /* Mailpit absent : ignoré, le test se skippera plus bas */
    }
  });

  test.afterEach(async () => {
    await deleteUserIfExists(FRESH_EMAIL);
  });

  test('demande un lien magique, le récupère dans Mailpit, le suit → session établie', async ({
    page,
  }) => {
    // 1. Déclencher l'envoi du magic link via le signup (Resend → Mailpit).
    await page.goto('/signup');
    await page.getByTestId('signup-email').fill(FRESH_EMAIL);
    await page.getByTestId('signup-tos').check();
    await page.getByTestId('signup-submit').click();
    await expect(page.getByText('Email envoyé', { exact: true })).toBeVisible({ timeout: 15_000 });

    // 2. Catcher l'email magic link dans Mailpit.
    let messages: Awaited<ReturnType<typeof getMailpitMessages>> = [];
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        messages = await getMailpitMessages({ to: FRESH_EMAIL });
        if (messages.length > 0) break;
        await page.waitForTimeout(500);
      }
    } catch {
      test.skip(true, 'Mailpit non joignable — flow magic link via email non testable.');
      return;
    }
    test.skip(
      messages.length === 0,
      `Aucun email magic link reçu pour ${FRESH_EMAIL} — vérifier Resend → Mailpit + Supabase service_role.`,
    );

    // Le sujet attendu est "Votre lien de connexion · Capiwise".
    const subject = messages[0]?.Subject ?? '';
    expect(subject.toLowerCase()).toMatch(/lien de connexion|connexion|capiwise/);

    // 3. Récupérer le HTML/Text complet pour extraire l'actionLink.
    const messageId = messages[0]!.ID;
    const detail = await page.request.get(`${MAILPIT_URL}/api/v1/message/${messageId}`);
    expect(detail.ok()).toBe(true);
    const json = (await detail.json()) as { HTML?: string; Text?: string };
    const haystack = `${json.HTML ?? ''} ${json.Text ?? ''}`;
    const linkMatch = haystack.match(ACTION_LINK_REGEX);
    expect(linkMatch?.[0], 'actionLink /auth/callback introuvable dans l’email').toBeTruthy();
    const actionLink = linkMatch![0];

    // 4. Suivre le lien (consomme l'OTP côté /auth/callback).
    await page.goto(actionLink);

    // 5. La session doit être établie : on atterrit sur une page authentifiée
    //    (un user frais sans org → /onboarding ; sinon /dashboard ou /portal),
    //    PAS de retour sur /login.
    await page.waitForURL(/\/(dashboard|portal|onboarding)/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
  });
});
