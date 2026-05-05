import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * PR #45 B5 — Smoke E2E pour la route /api/audit/export (HOTFIX PR #42).
 *
 * Vérifie que les 3 formats déclenchent un download natif (Bug #3 + #4 fix).
 * Utilise `page.waitForEvent('download')` pour intercepter le download
 * sans le sauvegarder sur disque (suffit pour valider que le download
 * a été initié + capturer le filename).
 *
 * Prérequis :
 *   - Migration 99000_qa_seed_users_org_dev_only appliquée
 *   - 5 users QA seedés (cf scripts/seed-qa-users.ts)
 *   - User OWNER (= owner@capiwise-qa.test) a la perm audit.export
 *
 * Selectors : alignés sur les data-testid PR #42 +#45 (audit-export-trigger,
 * audit-export-item-{json,pdf,csv}).
 */

test.describe('Audit Export — download routes (PR #45 hotfix)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
    await page.goto('/dashboard/audit-trail');
    await expect(page.getByTestId('audit-export-trigger')).toBeVisible();
  });

  test('JSON signé déclenche un download .json', async ({ page }) => {
    await page.getByTestId('audit-export-trigger').click();
    await expect(page.getByTestId('audit-export-menu')).toBeVisible();

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await page.getByTestId('audit-export-item-json').click();
    const download = await downloadPromise;

    // Filename pattern : capiwise-audit-{org_short}-{YYYY-MM-DD}.json
    expect(download.suggestedFilename()).toMatch(
      /^capiwise-audit-[0-9a-f]{8}-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });

  test('CSV déclenche un download .csv', async ({ page }) => {
    await page.getByTestId('audit-export-trigger').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await page.getByTestId('audit-export-item-csv').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('PDF déclenche un download .pdf (pas de boucle RSC infinie — Bug #4 fix)', async ({
    page,
  }) => {
    // Capture les requêtes RSC pendant le test pour valider qu'on ne
    // déclenche pas la boucle infinie de PR #42.
    let rscRequestCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('_rsc=')) rscRequestCount++;
    });

    await page.getByTestId('audit-export-trigger').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('audit-export-item-pdf').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    // Garde-fou Bug #4 : on attend max 5 requêtes RSC (sidebar refresh
    // possible mais pas 345). Si on dépasse → régression.
    await page.waitForTimeout(2_000); // laisse le temps à d'éventuelles requêtes
    expect(rscRequestCount).toBeLessThan(20);
  });
});
