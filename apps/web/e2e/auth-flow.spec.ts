import { test, expect } from '@playwright/test';

/**
 * Phase 3 smoke test (Module 2) — vérifie que les routes principales rendent
 * sans erreur runtime et que le proxy redirige correctement.
 *
 * Sont volontairement exclus de cette suite (ils nécessitent une vraie DB
 * Supabase ou un mock côté serveur — MSW à venir Phase 4) :
 *   - /select-org
 *   - /onboarding/create-org (post-login)
 *   - /accept-invite avec un vrai token
 *   - /dashboard avec une session active
 */

test.describe('Module 2 / Phase 3 — auth flow smoke', () => {
  test('home renders Capiwise branding', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Capiwise/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Pilotez vos plans d.+actionnariat salarié/,
    );
  });

  test('login renders the magic-link form (no password field)', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Connexion.*Capiwise/);
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Recevoir un lien/i })).toBeVisible();
    await expect(page.getByLabel(/Mot de passe/i)).toHaveCount(0);
  });

  test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
    const response = await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('unauthorized error page renders (public)', async ({ page }) => {
    await page.goto('/unauthorized');
    await expect(page.getByText('Accès refusé', { exact: true })).toBeVisible();
  });

  test('no-access error page renders (public)', async ({ page }) => {
    await page.goto('/no-access');
    await expect(page.getByText('Aucune organisation', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Créer une organisation/i })).toBeVisible();
  });

  test('settings sub-routes redirect anon to /login', async ({ page }) => {
    for (const path of [
      '/dashboard/settings',
      '/dashboard/settings/profile',
      '/dashboard/settings/members',
      '/dashboard/settings/organization',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} response status`).toBeLessThan(400);
      await expect(page).toHaveURL(/\/login(\?|$)/);
    }
  });
});
