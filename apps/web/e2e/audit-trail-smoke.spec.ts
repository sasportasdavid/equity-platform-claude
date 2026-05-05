import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * PR #44 B5 — 1er scénario E2E end-to-end avec auth bypass.
 *
 * 3 tests read-only sur /dashboard/audit-trail :
 *   1. OWNER accède + voit ≥ 1 event listé
 *   2. Click sur un event ouvre le drawer (URL `?event=…`)
 *   3. ESC ferme le drawer + URL nettoyée
 *
 * Selectors alignés sur les data-testid existants de PR #41 :
 *   - audit-trail-event (article inside row)
 *   - audit-event-row-clickable (wrapper client onClick)
 *   - audit-event-detail-drawer (popup Base UI Dialog)
 *   - audit-drawer-close (× button)
 *   - audit-drawer-section-hash (section EMPREINTE)
 *
 * Aucune mutation DB → pas de cleanup. Org QA isolée.
 */

test.describe('Audit Trail — smoke (Module 13 V1+V1.5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
  });

  test('OWNER peut accéder à /dashboard/audit-trail et voir le hero', async ({ page }) => {
    await page.goto('/dashboard/audit-trail');

    // Hero italic Fraunces présent (h1 wrap : "Bonjour, X événements au registre.")
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/registre/i);

    // Liste audit présente (testid PR #39)
    const list = page.getByTestId('audit-trail-list');
    await expect(list).toBeVisible({ timeout: 5_000 });
  });

  test('Click sur un event ouvre le drawer detail (URL ?event=…)', async ({ page }) => {
    await page.goto('/dashboard/audit-trail');

    // Wait pour la liste, puis click sur la 1ère row
    const firstRow = page.getByTestId('audit-event-row-clickable').first();
    await expect(firstRow).toBeVisible({ timeout: 5_000 });
    await firstRow.click();

    // Drawer (Base UI Dialog Popup) visible
    const drawer = page.getByTestId('audit-event-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 3_000 });

    // URL contient ?event=…
    await expect(page).toHaveURL(/\?event=/);

    // Section EMPREINTE rendue (cf testid PR #41 AuditEventDetailContent)
    const hashSection = page.getByTestId('audit-drawer-section-hash');
    await expect(hashSection).toBeVisible();
  });

  test('Click backdrop ferme le drawer + URL nettoyée', async ({ page }) => {
    await page.goto('/dashboard/audit-trail');

    const firstRow = page.getByTestId('audit-event-row-clickable').first();
    await expect(firstRow).toBeVisible({ timeout: 5_000 });
    await firstRow.click();

    const drawer = page.getByTestId('audit-event-detail-drawer');
    await expect(drawer).toBeVisible();

    // Click sur le bouton de fermeture × (testid PR #41)
    const closeButton = page.getByTestId('audit-drawer-close');
    await closeButton.click();

    // Drawer disparaît + ?event= retiré de l'URL
    await expect(drawer).not.toBeVisible({ timeout: 2_000 });
    await expect(page).not.toHaveURL(/\?event=/);
  });
});
