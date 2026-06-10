import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Pre-launch hardening — E2E document-generate-preview (Module 6).
 *
 * Sur le détail d'un award, onglet Documents : générer / prévisualiser le
 * PDF et vérifier le statut du document — SANS toucher Yousign (envoi pour
 * signature exclu).
 *
 * Selectors (data-testid + libellés réels) :
 *   - award-link-{id} (awards-list-client) pour atteindre un détail
 *   - tab-documents (award-detail-client TabsTrigger)
 *   - AwardDocumentsTab : bouton texte "Générer le document d'attribution"
 *     (empty state) OU "Re-générer", "Aperçu PDF" ; DocumentStatusBadge
 *
 * Robustesse : la génération PDF est une mutation (insert documents row).
 * Si aucun award n'est seedé dans l'org QA, le test se skippe. Le test
 * vérifie en priorité que l'onglet Documents rend (empty state OU liste de
 * documents avec un badge statut), sans exiger un PDF préexistant.
 */

test.describe('Document engine — génération / aperçu (Module 6)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
  });

  /** Navigue vers le détail du 1er award listé. Renvoie false si liste vide. */
  async function openFirstAwardDetail(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/dashboard/awards');
    const firstLink = page.locator('[data-testid^="award-link-"]').first();
    if (!(await firstLink.isVisible({ timeout: 3_000 }).catch(() => false))) return false;
    await firstLink.click();
    await expect(page).toHaveURL(/\/dashboard\/awards\/[0-9a-f-]{8,}/, { timeout: 10_000 });
    return true;
  }

  test('l’onglet Documents rend (empty state ou liste de documents)', async ({ page }) => {
    const ok = await openFirstAwardDetail(page);
    test.skip(!ok, 'Aucun award seedé dans l’org QA — onglet Documents non testable.');

    await page.getByTestId('tab-documents').click();

    // Soit l'empty state avec CTA générer, soit une liste de documents.
    const emptyCta = page.getByRole('button', {
      name: /Générer le document d.attribution/i,
    });
    const previewBtn = page.getByRole('button', { name: /Aperçu PDF/i }).first();
    const emptyVisible = await emptyCta.isVisible({ timeout: 5_000 }).catch(() => false);
    const previewVisible = await previewBtn.isVisible({ timeout: 1_000 }).catch(() => false);
    expect(
      emptyVisible || previewVisible,
      'Ni CTA générer ni aperçu PDF visibles dans l’onglet Documents',
    ).toBe(true);
  });

  test('génère un document depuis l’empty state (si applicable)', async ({ page }) => {
    const ok = await openFirstAwardDetail(page);
    test.skip(!ok, 'Aucun award seedé dans l’org QA.');

    await page.getByTestId('tab-documents').click();

    const generateBtn = page.getByRole('button', {
      name: /Générer le document d.attribution/i,
    });
    const hasEmptyCta = await generateBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(
      !hasEmptyCta,
      'L’award a déjà un document (pas d’empty state) — génération non rejouée.',
    );

    await generateBtn.click();

    // Après génération : un document apparaît avec un bouton "Aperçu PDF"
    // OU un message d'erreur explicite (template manquant en seed QA).
    const previewBtn = page.getByRole('button', { name: /Aperçu PDF/i }).first();
    const regenBtn = page.getByRole('button', { name: /Re-générer/i });
    await expect(previewBtn.or(regenBtn).first()).toBeVisible({ timeout: 20_000 });
  });
});
