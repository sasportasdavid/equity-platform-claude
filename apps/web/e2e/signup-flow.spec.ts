import { expect, test } from '@playwright/test';

/**
 * Module 14 PR #43 §B6 — E2E signup-flow.
 *
 * Couvre :
 *   - rendu page /signup avec form email + checkbox ToS (DS V1)
 *   - validation client : submit sans cocher ToS → erreur inline
 *   - submit avec ToS coché → message "Email envoyé" (anti enumeration)
 *   - lien retour /login depuis le signup
 *
 * **Pas de Mailpit catch** : `signInWithOtp` côté browser passe par
 * Supabase Auth (template par défaut Supabase), pas par Resend custom
 * — donc le mail n'apparaît pas dans Mailpit local en V1.
 * Vérification end-to-end du magic-link déférée à V1.5 quand on aura un
 * Auth Hook "Send Email" Resend custom (cf. memo B0 §Q3).
 *
 * Les emails Mailpit catchables en V1 : invitations (`team_member_invite`,
 * `beneficiary_first_invite`), notifications Module 7 — cf.
 * invitation-accept.spec.ts.
 *
 * Email use case : on génère `signup-${ts}@capiwise-qa.test` à chaque
 * run pour ne pas polluer la DB avec des conflits.
 */

const TIMESTAMP = Date.now();
const FRESH_EMAIL = `signup-${TIMESTAMP}@capiwise-qa.test`;

test.describe('Module 14 §B6 — signup-flow', () => {
  test('renders signup form with email + ToS checkbox + link to /login', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveTitle(/Créer un compte.*Capiwise/);
    await expect(page.getByTestId('signup-form')).toBeVisible();
    await expect(page.getByTestId('signup-email')).toBeVisible();
    await expect(page.getByTestId('signup-tos')).toBeVisible();
    await expect(page.getByTestId('signup-submit')).toBeVisible();

    // Lien vers /login présent
    await expect(page.getByRole('link', { name: /Se connecter/i }).first()).toBeVisible();

    // Pas de password field — flow magic-link only (spec MODULE_02 §1.1)
    await expect(page.getByLabel(/Mot de passe/i)).toHaveCount(0);
  });

  test('blocks submit if ToS checkbox is unchecked', async ({ page }) => {
    await page.goto('/signup');
    await page.getByTestId('signup-email').fill(FRESH_EMAIL);
    await page.getByTestId('signup-submit').click();

    // L'attribute `required` côté HTML déclenche la validation native du
    // browser — la page reste sur /signup et le form n'est pas soumis.
    await expect(page).toHaveURL(/\/signup/);
    // Le testid signup-form est toujours visible (pas remplacé par sentTo card)
    await expect(page.getByTestId('signup-form')).toBeVisible();
  });

  test('happy path : email + ToS coché → "Email envoyé" écran', async ({ page }) => {
    await page.goto('/signup');
    await page.getByTestId('signup-email').fill(FRESH_EMAIL);
    await page.getByTestId('signup-tos').check();
    await page.getByTestId('signup-submit').click();

    // Attendre la card "Email envoyé" (peut prendre quelques secondes :
    // SA crée user via admin client + signInWithOtp côté browser)
    await expect(page.getByText('Email envoyé', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('strong').filter({ hasText: FRESH_EMAIL })).toBeVisible();
    await expect(page.getByRole('button', { name: /Utiliser une autre adresse/i })).toBeVisible();
  });

  test('cookie consent banner appears on first /signup visit', async ({ page, context }) => {
    // Clear cookies pour simuler un nouveau visiteur
    await context.clearCookies();
    await page.goto('/signup');
    await expect(page.getByTestId('cookie-consent-banner')).toBeVisible();
    await expect(page.getByTestId('cookie-consent-accept')).toBeVisible();

    // Click accept → banner disparaît + cookie posé
    await page.getByTestId('cookie-consent-accept').click();
    await expect(page.getByTestId('cookie-consent-banner')).toBeHidden();

    // Reload : banner ne réapparaît pas (cookie consent_v1 persisté)
    await page.reload();
    await expect(page.getByTestId('cookie-consent-banner')).toBeHidden();
  });
});
