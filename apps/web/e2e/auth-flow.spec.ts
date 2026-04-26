import { test, expect } from '@playwright/test';

/**
 * Phase 1 smoke test — vérifie que le bootstrap du framework est sain :
 *  1. La home page charge avec le branding Capiwise.
 *  2. /login affiche le formulaire et les champs requis.
 *  3. /signup affiche le formulaire d'inscription.
 *
 * NOTE — Pourquoi pas de test "auth réelle" ici :
 * Mocker Supabase de manière propre côté serveur Next (RSC + Server Actions)
 * demande MSW + un setup non-trivial. On l'ajoutera en Phase 2 (Module 2 —
 * Identity & Roles) avec un vrai harness d'intégration. Pour Phase 1, on
 * valide juste que le squelette boote, render, et n'a pas d'erreur runtime.
 *
 * Le test tourne avec NEXT_PUBLIC_SUPABASE_URL pointé vers un mock vide
 * (cf. playwright.config.ts) ; le proxy ne fait pas de redirect serveur tant
 * qu'on reste sur les routes publiques (/, /login, /signup).
 */

test.describe('Bootstrap smoke', () => {
  test('home renders Capiwise branding', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Capiwise/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Pilotez vos plans d.+actionnariat salarié/,
    );
    // Au moins un lien vers /login dans la page (header + CTA)
    const loginLinks = page.getByRole('link', { name: /Se connecter|Accéder à la plateforme/i });
    await expect(loginLinks.first()).toBeVisible();
  });

  test('login page renders the form with email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Connexion.*Capiwise/);
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Mot de passe/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Se connecter/i })).toBeVisible();
  });

  test('signup page renders the form with all required fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveTitle(/Créer un compte.*Capiwise/);
    await expect(page.getByTestId('signup-form')).toBeVisible();
    await expect(page.getByLabel(/Nom complet/i)).toBeVisible();
    await expect(page.getByLabel(/^Email$/)).toBeVisible();
    await expect(page.getByLabel(/^Mot de passe$/)).toBeVisible();
    await expect(page.getByLabel(/Confirmer le mot de passe/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Créer mon compte/i })).toBeVisible();
  });
});
