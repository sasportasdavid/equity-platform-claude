import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Module 14 PR #43 §B6 — E2E onboarding-wizard.
 *
 * Couvre :
 *   1. Anon sur /onboarding* → redirect /login (proxy gate).
 *   2. User QA déjà onboardé (OWNER capiwise-qa, migration 00100) sur
 *      /onboarding → redirect /dashboard via le routeur SSR
 *      `resolveOnboardingState`.
 *   3. Pages /onboarding/{profile,company,welcome} : rendu DS V1
 *      (stepper + heroes italic Fraunces) en mode anon → redirect login.
 *
 * **Test du flow complet "fresh signup → wizard 4 étapes → completion"**
 * non couvert ici : nécessite un compte fresh sans full_name ni
 * membership ACTIVE, créé via signup → confirmé par magic-link. Comme le
 * magic-link Supabase ne passe pas par Mailpit en local (cf.
 * signup-flow.spec.ts commentaires), ce flow est testé manuellement
 * (cf memory/module_14_complete.md §Scénarios E2E manuels).
 */

test.describe('Module 14 §B6 — onboarding-wizard redirects', () => {
  test('anon on /onboarding → redirect /login', async ({ page }) => {
    const response = await page.goto('/onboarding');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('anon on /onboarding/profile → redirect /login', async ({ page }) => {
    await page.goto('/onboarding/profile');
    await expect(page).toHaveURL(/\/login/);
  });

  test('anon on /onboarding/company → redirect /login', async ({ page }) => {
    await page.goto('/onboarding/company');
    await expect(page).toHaveURL(/\/login/);
  });

  test('anon on /onboarding/welcome → redirect /login', async ({ page }) => {
    await page.goto('/onboarding/welcome');
    await expect(page).toHaveURL(/\/login/);
  });

  test('OWNER déjà onboardé sur /onboarding → /dashboard', async ({ page }) => {
    await loginAs(page, 'OWNER');
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('OWNER déjà onboardé sur /onboarding/welcome → /dashboard via routeur', async ({ page }) => {
    await loginAs(page, 'OWNER');
    // Naviguer directement vers /onboarding/welcome — la page Welcome
    // détecte state.completed=true et redirige vers /dashboard via le SSR
    await page.goto('/onboarding/welcome');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });
});

test.describe('Module 14 §B6 — pages legal accessibles à anon', () => {
  test('GET /legal/terms renders public', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page).toHaveTitle(/Conditions d.utilisation.*Capiwise/);
    await expect(page.getByText('Conditions d', { exact: false }).first()).toBeVisible();
    // Disclaimer placeholder V1
    await expect(page.getByTestId('legal-draft-banner')).toBeVisible();
  });

  test('GET /legal/privacy renders public', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page).toHaveTitle(/Politique de confidentialité.*Capiwise/);
    await expect(page.getByText(/RGPD|cookies essentiels/i).first()).toBeVisible();
  });

  test('GET /legal/dpa renders public', async ({ page }) => {
    await page.goto('/legal/dpa');
    await expect(page).toHaveTitle(/Accord de traitement.*Capiwise/);
  });
});
