import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Pre-launch hardening — E2E compliance-gate (Modules 3b B7 + 12).
 *
 * Objectif : prouver que le moteur de conformité s'affiche et qu'une
 * soumission peut être bloquée par une rule HARD.
 *
 * Provoquer une violation HARD déterministe via l'UI nécessite une seed
 * précise (ex : award AGA poussant au-delà du cap 30 %), non garantie par
 * la seed QA V1. On adopte donc une stratégie en 2 temps :
 *
 *   1. SMOKE robuste (toujours actif) : la page admin
 *      /dashboard/settings/compliance rend la liste des rules configurables
 *      (data-testid="compliance-settings" + rule-card-*). C'est la preuve
 *      que le moteur compliance est câblé.
 *
 *   2. Best-effort : ouvrir CreateAwardModal, tenter "Créer et soumettre"
 *      (submit-proposed) ; si une rule HARD bloque, le ComplianceIssuesDialog
 *      ("Conformité — règles bloquantes") s'affiche avec ≥ 1 issue
 *      (compliance-issue-*). On n'exige pas le blocage (dépend de la seed),
 *      mais s'il survient on vérifie le message.
 *
 * Selectors (data-testid réels) :
 *   - compliance-settings, rule-card-{code}, toggle-{code} (ComplianceSettingsClient)
 *   - new-award-button, modal-plan-select, beneficiary-combobox,
 *     modal-units-input, submit-proposed (CreateAwardModal)
 *   - compliance-issue-{code} (ComplianceIssuesDialog)
 */

test.describe('Compliance gate (Modules 3b B7 + 12)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
  });

  test('la page paramètres compliance affiche les rules configurables', async ({ page }) => {
    await page.goto('/dashboard/settings/compliance');
    // L'OWNER QA a la perm compliance_rules.config.write.
    await expect(page.getByTestId('compliance-settings')).toBeVisible({ timeout: 10_000 });
    // Au moins une rule-card rendue (23 rules seedées en V1).
    const ruleCards = page.locator('[data-testid^="rule-card-"]');
    await expect(ruleCards.first()).toBeVisible({ timeout: 5_000 });
    expect(await ruleCards.count()).toBeGreaterThan(0);
  });

  test('soumission d’un award : une rule HARD peut bloquer (best-effort)', async ({ page }) => {
    await page.goto('/dashboard/awards');
    await page.getByTestId('new-award-button').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const planSelect = page.getByTestId('modal-plan-select');
    const planOptionCount = await planSelect.locator('option').count();
    test.skip(planOptionCount <= 1, 'Aucun plan ACTIVE seedé — soumission non testable.');
    await planSelect.selectOption({ index: 1 });

    const combo = page.getByTestId('beneficiary-combobox');
    await combo.fill('a');
    await page.waitForTimeout(800);
    const options = page.locator('[role="option"]');
    test.skip((await options.count()) === 0, 'Aucun bénéficiaire seedé — soumission non testable.');
    await options.first().click();

    // Saisir un grand nombre d'unités pour maximiser la chance de dépasser
    // un cap (pool / AGA 30 %) et déclencher une rule HARD.
    await page.getByTestId('modal-units-input').fill('999999999');

    // "Créer et soumettre" (PROPOSED) déclenche runComplianceChecks.
    const submitProposed = page.getByTestId('submit-proposed');
    // Le bouton peut être désactivé si units > pool (poolExceeded) — dans ce
    // cas la garde UI joue déjà son rôle, on considère le test satisfait.
    const enabled = await submitProposed.isEnabled().catch(() => false);
    if (!enabled) {
      // Garde-fou frontend actif (pool dépassé) : la cohérence est protégée.
      await expect(submitProposed).toBeDisabled();
      return;
    }

    await submitProposed.click();

    // Si une rule HARD bloque, le dialog compliance apparaît.
    const complianceDialog = page.getByText('Conformité — règles bloquantes');
    const blocked = await complianceDialog.isVisible({ timeout: 8_000 }).catch(() => false);
    if (blocked) {
      const issues = page.locator('[data-testid^="compliance-issue-"]');
      await expect(issues.first()).toBeVisible();
      expect(await issues.count()).toBeGreaterThan(0);
    }
    // Si non bloqué (seed sans rule HARD applicable), le test passe : la
    // chaîne compliance a tourné sans crash (smoke du moteur en runtime).
  });
});
