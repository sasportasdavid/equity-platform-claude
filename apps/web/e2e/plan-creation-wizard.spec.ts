import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Pre-launch hardening — E2E plan-creation-wizard (Module 3a).
 *
 * Le wizard de création de plan a 7 étapes (cf
 * components/plans/wizard/E2E_SCENARIOS.md §1 "Bootstrap minimal BSPCE").
 * Ce test parcourt les étapes clés et crée un plan BSPCE minimal, puis
 * vérifie qu'il apparaît dans la liste des plans.
 *
 * Selectors (data-testid réels) :
 *   - step-1-plan-type, plan-type-bspce (BSPCE sélectionné par défaut)
 *   - plan-name, plan-board-date, plan-pool-size, plan-exercise-price (Step2, ids)
 *   - vesting-mode-single (Step3 VestingModeCard), #single-vesting-date
 *   - step-5-leavers + leaver-preset-* (preset rapide)
 *   - #val-underlyingPrice / #val-volatility / #val-riskFreeRate /
 *     #val-timeHorizonYears (Step6 NumberField id=`val-${name}`)
 *   - wizard-next, wizard-submit (WizardFooter), wizard-success-banner /
 *     redirect vers /dashboard/plans/[id]
 *
 * NOTE robustesse : le wizard a beaucoup de validation Zod cross-step. Si la
 * navigation se bloque sur une étape (validation), le test asserte qu'on
 * reste sur le wizard et n'invente pas un faux succès. La création réelle
 * (commit DB via createPlan + redirect) est best-effort.
 */

const TS = Date.now();
const PLAN_NAME = `Plan E2E ${TS}`;

async function clickNext(page: import('@playwright/test').Page) {
  await page.getByTestId('wizard-next').click();
}

test.describe('Plan creation wizard — BSPCE minimal (Module 3a)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
    await page.goto('/dashboard/plans/new');
  });

  test('le wizard rend Step 1 (type de plan) avec BSPCE disponible', async ({ page }) => {
    await expect(page.getByTestId('step-1-plan-type')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('plan-type-bspce')).toBeVisible();
    await expect(page.getByTestId('wizard-next')).toBeVisible();
  });

  test('parcourt les 7 étapes et crée un plan BSPCE minimal', async ({ page }) => {
    // --- Step 1 : type de plan (BSPCE par défaut) ---
    await expect(page.getByTestId('step-1-plan-type')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('plan-type-bspce').click();
    await clickNext(page);

    // --- Step 2 : infos générales ---
    await expect(page.getByTestId('step-2-general-info')).toBeVisible({ timeout: 5_000 });
    await page.locator('#plan-name').fill(PLAN_NAME);
    await page.locator('#plan-board-date').fill('2026-01-15');
    await page.locator('#plan-pool-size').fill('50000');
    // Prix d'exercice (BSPCE) — champ présent selon plan_type
    const exercisePrice = page.locator('#plan-exercise-price');
    if (await exercisePrice.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await exercisePrice.fill('1.5');
    }
    await clickNext(page);

    // --- Step 3 : vesting (mode single) ---
    await expect(page.getByTestId('step-3-vesting')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('vesting-mode-single').click();
    const singleDate = page.locator('#single-vesting-date');
    await expect(singleDate).toBeVisible({ timeout: 3_000 });
    await singleDate.fill('2030-01-15');
    await clickNext(page);

    // --- Step 4 : performance (laisser désactivé) ---
    await expect(page.getByTestId('step-4-performance')).toBeVisible({ timeout: 5_000 });
    await clickNext(page);

    // --- Step 5 : leavers (preset rapide) ---
    await expect(page.getByTestId('step-5-leavers')).toBeVisible({ timeout: 5_000 });
    const firstPreset = page.locator('[data-testid^="leaver-preset-"]').first();
    if (await firstPreset.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await firstPreset.click();
    }
    await clickNext(page);

    // --- Step 6 : valorisation (paramètres Python) ---
    await expect(page.getByTestId('step-6-valuation')).toBeVisible({ timeout: 5_000 });
    await page.locator('#val-underlyingPrice').fill('12.5');
    await page.locator('#val-volatility').fill('32');
    await page.locator('#val-riskFreeRate').fill('3.5');
    await page.locator('#val-timeHorizonYears').fill('4');
    await clickNext(page);

    // --- Step 7 : review + créer ---
    await expect(page.getByTestId('step-7-review')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('wizard-submit')).toBeVisible();
    await page.getByTestId('wizard-submit').click();

    // Succès : soit redirect /dashboard/plans/[id], soit banner succès.
    await Promise.race([
      page.waitForURL(/\/dashboard\/plans\/[0-9a-f-]{8,}/, { timeout: 20_000 }),
      page.getByTestId('wizard-success-banner').waitFor({ state: 'visible', timeout: 20_000 }),
    ]);

    // Vérifier que le plan apparaît dans la liste des plans.
    await page.goto('/dashboard/plans');
    await expect(page.getByText(PLAN_NAME).first()).toBeVisible({ timeout: 10_000 });
  });
});
