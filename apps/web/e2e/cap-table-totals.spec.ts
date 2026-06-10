import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Pre-launch hardening — E2E cap-table-totals (Module 10).
 *
 * Login OWNER, ouvrir la cap table, vérifier la cohérence des totaux :
 *   - la matrice rend (data-testid="cap-table-matrix")
 *   - la ligne "Total général" affiche 100,00 % (somme des % = 100)
 *   - bascule sur la vue DILUTED ("Dilué") via le segmented control et
 *     re-vérifie que la matrice + le total 100 % restent cohérents.
 *
 * Selectors (data-testid réels) :
 *   - valuation-toggle (ValuationToggle, role=tablist) avec boutons
 *     role="tab" libellés "Consolidé" / "Dilué" / "Pro forma"
 *   - cap-table-matrix (CapTableMatrix) + footer "Total général" + "100,00 %"
 *   - cap-table-tabs onglet "Tableau" (la matrice est sous cet onglet)
 *
 * Robustesse : aucune mutation. Si l'org QA n'a aucune position en cap
 * table, la page affiche un EmptyState ("Aucune position dans la cap
 * table") au lieu de la matrice → les sous-tests de totaux se skippent
 * proprement.
 */

test.describe('Cap table — cohérence des totaux (Module 10)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
    await page.goto('/dashboard/captable');
  });

  test('la page cap table rend (matrice ou empty state)', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 10_000 });
    // Soit la matrice, soit l'empty state — la page ne doit pas planter.
    const matrix = page.getByTestId('cap-table-matrix');
    const empty = page.getByText(/Aucune position dans la cap table/i);
    const hasMatrix = await matrix.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 1_000 }).catch(() => false);
    expect(hasMatrix || hasEmpty, 'Ni matrice ni empty state visibles').toBe(true);
  });

  test('vue consolidée : le total général somme à 100,00 %', async ({ page }) => {
    const matrix = page.getByTestId('cap-table-matrix');
    const hasMatrix = await matrix.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasMatrix, 'Cap table vide dans l’org QA — pas de totaux à vérifier.');

    // Le footer de la matrice affiche "Total général" + 100,00 %.
    await expect(matrix.getByText(/Total général/i)).toBeVisible();
    await expect(matrix.getByText('100,00 %')).toBeVisible();
  });

  test('bascule en vue DILUTED ("Dilué") et re-vérifie la cohérence', async ({ page }) => {
    const toggle = page.getByTestId('valuation-toggle');
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // Cliquer l'onglet "Dilué" (DILUTED).
    await toggle.getByRole('tab', { name: /Dilué/i }).click();

    // L'URL doit refléter le viewMode dilué (?view=DILUTED).
    await expect(page).toHaveURL(/view=DILUTED/, { timeout: 5_000 });

    const matrix = page.getByTestId('cap-table-matrix');
    const hasMatrix = await matrix.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasMatrix, 'Cap table vide en vue diluée — pas de totaux à vérifier.');

    // Le total dilué doit toujours sommer à 100 %.
    await expect(matrix.getByText('100,00 %')).toBeVisible();
  });
});
