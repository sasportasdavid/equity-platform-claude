import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * PR #45 B5 — Smoke E2E défensif pour le drawer audit (Bug #5 P1 fix).
 *
 * Vérifie que le drawer ne crash JAMAIS, même sur un id inexistant ou
 * malformé. La Boundary `AuditDrawerErrorBoundary` (PR #45 B3) doit
 * intercepter tout crash de rendu et afficher le fallback gracieux.
 *
 * Cas testés :
 *   1. Event valide (1er row de la liste) → drawer rend normalement
 *   2. Event id totalement inventé (ne match aucune row) → drawer rend
 *      le "Événement introuvable" empty state (cf AuditEventDetailContent
 *      L46 : if (!event) return Événement introuvable)
 *   3. Event id malformé (pas un UUID) → idem empty state via la guard
 *      `getAuditEventById` qui rejette les non-UUIDs
 *
 * Si crash : la `AuditDrawerErrorBoundary` rend `audit-drawer-error`
 * (testid). On vérifie que ce testid n'apparaît PAS sur des cas valides.
 */

test.describe('Audit Event Drawer — defensive (PR #45 hotfix Bug #5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
  });

  test("Drawer rend normalement sur un event id valide (pas d'error boundary)", async ({
    page,
  }) => {
    await page.goto('/dashboard/audit-trail');

    const firstRow = page.getByTestId('audit-event-row-clickable').first();
    await firstRow.click();

    const drawer = page.getByTestId('audit-event-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 3_000 });

    // Pas de fallback error boundary → contenu normal rendu
    await expect(page.getByTestId('audit-drawer-error')).not.toBeVisible();
    await expect(page.getByTestId('audit-drawer-section-hash')).toBeVisible();
  });

  test('Drawer empty state sur event id inexistant (pas de crash)', async ({ page }) => {
    // UUID valide format mais pas en DB
    const fakeEventId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/dashboard/audit-trail?event=${fakeEventId}`);

    const drawer = page.getByTestId('audit-event-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 3_000 });

    // Empty state "Événement introuvable" présent + pas de boundary
    await expect(page.getByTestId('audit-drawer-not-found')).toBeVisible();
    await expect(page.getByTestId('audit-drawer-error')).not.toBeVisible();
  });

  test('Drawer empty state sur event id malformé (pas de crash)', async ({ page }) => {
    // Non-UUID — getAuditEventById guard rejette en pré-DB
    await page.goto('/dashboard/audit-trail?event=not-a-valid-uuid');

    const drawer = page.getByTestId('audit-event-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 3_000 });

    await expect(page.getByTestId('audit-drawer-not-found')).toBeVisible();
    await expect(page.getByTestId('audit-drawer-error')).not.toBeVisible();
  });
});
