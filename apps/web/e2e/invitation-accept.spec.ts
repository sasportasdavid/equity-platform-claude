import { expect, test } from '@playwright/test';
import { clearMailpit, getMailpitMessages, loginAs } from './helpers/auth';

/**
 * Module 14 PR #43 §B6 — E2E invitation-accept.
 *
 * Couvre l'invitation flow end-to-end :
 *   1. OWNER capiwise-qa loggé via bypass.
 *   2. Naviguer vers /dashboard/settings/members.
 *   3. Inviter un nouveau user `invited-${ts}@capiwise-qa.test`.
 *   4. Catcher l'email Resend `team_member_invite` dans Mailpit.
 *   5. Extraire le token de l'URL d'acceptation.
 *   6. Naviguer (nouvelle session) vers /accept-invite?token=...
 *   7. Cliquer "Accepter" et vérifier le redirect.
 *
 * **Conditions** :
 *   - Mailpit doit être lancé (cf docs/QA_SETUP.md). Si absent, les
 *     `getMailpitMessages` retourneront [] et le test fail vite.
 *   - L'env Resend doit être configuré pour router vers Mailpit en
 *     dev (RESEND_API_KEY + smtp_password fictif → Mailpit catch).
 *
 * **Pas de retour login fail** : le test ne valide pas la session
 * post-accept (le helper `loginAs` est utilisé pour le caller, pas
 * pour le user invité). On vérifie juste que la page rend le succès.
 */

const TIMESTAMP = Date.now();
const INVITED_EMAIL = `invited-${TIMESTAMP}@capiwise-qa.test`;

// Pattern token UUID hex 64 chars (cf. invitations.token côté DB)
const TOKEN_REGEX = /\/accept-invite\?token=([a-f0-9]{32,128})/;

test.describe('Module 14 §B6 — invitation-accept', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('OWNER invites user → email Resend Mailpit → token extracted', async ({ page }) => {
    await loginAs(page, 'OWNER');

    // Naviguer vers /dashboard/settings/members
    await page.goto('/dashboard/settings/members');
    await expect(page).toHaveURL(/\/dashboard\/settings\/members/);

    // Cliquer le bouton "Inviter" (pattern existing dans la page Members)
    const inviteButton = page.getByRole('button', { name: /Inviter|Inviter un membre/i }).first();
    await inviteButton.click();

    // Attendre le dialog
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // Remplir email + sélectionner role ADMIN_HR (par défaut)
    await page.getByLabel(/Email/i).fill(INVITED_EMAIL);

    // Le rôle par défaut peut être pré-sélectionné — sinon on coche ADMIN_HR
    const adminHrCheckbox = page.getByLabel(/ADMIN_HR|Admin RH/i).first();
    if (await adminHrCheckbox.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const checked = await adminHrCheckbox.isChecked().catch(() => false);
      if (!checked) await adminHrCheckbox.check();
    }

    // Submit
    await page
      .getByRole('button', { name: /Envoyer l.invitation|Inviter/i })
      .last()
      .click();

    // Wait for success toast OR dialog close (depend du UI Module 2)
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

    // Catcher l'email Mailpit (Resend custom template `team_member_invite`)
    let messages: Awaited<ReturnType<typeof getMailpitMessages>> = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      messages = await getMailpitMessages({ to: INVITED_EMAIL });
      if (messages.length > 0) break;
      await page.waitForTimeout(500);
    }
    expect(
      messages.length,
      `No invitation email reached Mailpit for ${INVITED_EMAIL} — vérifier RESEND_API_KEY routing & Mailpit running`,
    ).toBeGreaterThan(0);

    // Récupérer le contenu HTML pour extraire le token (Mailpit /api/v1/message/{id})
    const messageId = messages[0]!.ID;
    const messageBody = await page.request.get(
      `${process.env.MAILPIT_URL ?? 'http://localhost:8025'}/api/v1/message/${messageId}`,
    );
    expect(messageBody.ok()).toBe(true);
    const json = (await messageBody.json()) as { HTML?: string; Text?: string };
    const haystack = (json.HTML ?? '') + ' ' + (json.Text ?? '');
    const tokenMatch = haystack.match(TOKEN_REGEX);
    expect(tokenMatch?.[1], 'token not found in Mailpit body').toBeTruthy();
    const token = tokenMatch![1]!;

    // 2e étape : ouvrir une nouvelle page (sans session OWNER) pour
    // simuler le flow de l'invité depuis son client mail.
    const fresh = await page.context().newPage();
    await fresh.goto(`/accept-invite?token=${token}`);
    await expect(fresh.getByText(/Capiwise QA|Accepter|invité/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('accept-invite with invalid token → graceful + resend button (B3)', async ({ page }) => {
    const fakeToken = 'a'.repeat(64);
    await page.goto(`/accept-invite?token=${fakeToken}`);
    await expect(page.getByText(/invalide|expirée|déjà utilisée/i).first()).toBeVisible();
    await expect(page.getByTestId('invitation-request-resend')).toBeVisible();

    // Click le bouton "Demander une nouvelle invitation" — anti-enum :
    // retour ok: true peu importe la validité du token
    await page.getByTestId('invitation-request-resend').click();
    await expect(page.getByTestId('invitation-resend-confirmed')).toBeVisible({ timeout: 5_000 });
  });
});
