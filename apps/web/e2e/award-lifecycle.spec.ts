import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Pre-launch hardening — E2E award-lifecycle (Module 3b).
 *
 * Flow métier critique : un OWNER crée une attribution en brouillon (DRAFT)
 * puis la propose (transition DRAFT → PROPOSED). On vérifie que :
 *   1. La page liste rend + le bouton "Nouvelle attribution" est présent.
 *   2. La modale CreateAwardModal s'ouvre, on sélectionne un plan, un
 *      bénéficiaire existant (combobox), on saisit des units + une date.
 *   3. "Créer en brouillon" crée l'award et il apparaît en DRAFT (Brouillon).
 *   4. Via le menu de row actions, on force la transition → PROPOSED
 *      (debug admin) et le statut affiché passe à "Proposé".
 *
 * Selectors (data-testid des composants réels) :
 *   - new-award-button, modal-plan-select, beneficiary-combobox (BeneficiaryCombobox),
 *     modal-units-input, modal-grant-date, submit-draft (CreateAwardModal)
 *   - award-actions-{id}, force-transition-PROPOSED (AwardRowActions)
 *   - AwardStatusBadge labels : DRAFT="Brouillon", PROPOSED="Proposé"
 *
 * Robustesse : ce test EFFECTUE une mutation (création d'award). La seed QA
 * est partagée ; on n'effectue pas de cleanup DB (cf. règle d'or QA_SETUP §1,
 * read-only par défaut). Les sous-tests qui dépendent d'un plan + bénéficiaire
 * seedés se skippent proprement si la combobox / le select sont vides plutôt
 * que de fail (la seed QA V1 ne garantit pas encore un plan ACTIVE + un
 * bénéficiaire). Cf rapport pre-launch — data-testid manquants notés.
 */

test.describe('Award lifecycle — création + proposition (Module 3b)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
    await page.goto('/dashboard/awards');
    await expect(page).toHaveURL(/\/dashboard\/awards/);
  });

  test('la page liste rend avec le CTA "Nouvelle attribution"', async ({ page }) => {
    await expect(page.getByTestId('new-award-button')).toBeVisible({ timeout: 5_000 });
    // Heading principal de la page (PageShell / liste)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('ouvre la modale création et la remplit (plan + bénéficiaire + units)', async ({ page }) => {
    await page.getByTestId('new-award-button').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Nouvelle attribution')).toBeVisible();

    // Sélection d'un plan — la modale liste les plans éligibles (ACTIVE).
    const planSelect = page.getByTestId('modal-plan-select');
    await expect(planSelect).toBeVisible();
    const planOptionCount = await planSelect.locator('option').count();
    test.skip(
      planOptionCount <= 1,
      'Aucun plan ACTIVE seedé dans l’org QA — impossible de créer un award via UI',
    );

    // Choisir le 1er plan réel (index 1, l’index 0 étant souvent un placeholder)
    await planSelect.selectOption({ index: 1 });

    // Les champs units + date doivent maintenant être présents
    await expect(page.getByTestId('modal-units-input')).toBeVisible();
    await page.getByTestId('modal-units-input').fill('100');
    await expect(page.getByTestId('modal-grant-date')).toBeVisible();
  });

  test('crée un award en DRAFT puis le propose (force-transition → PROPOSED)', async ({ page }) => {
    await page.getByTestId('new-award-button').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const planSelect = page.getByTestId('modal-plan-select');
    const planOptionCount = await planSelect.locator('option').count();
    test.skip(planOptionCount <= 1, 'Aucun plan ACTIVE seedé — création impossible.');
    await planSelect.selectOption({ index: 1 });

    // Sélection d’un bénéficiaire existant via la combobox.
    const combo = page.getByTestId('beneficiary-combobox');
    await expect(combo).toBeVisible();
    await combo.fill('a');
    await page.waitForTimeout(800); // debounce searchBeneficiaries + RTT
    const options = page.locator('[role="option"]');
    const optCount = await options.count();
    test.skip(optCount === 0, 'Aucun bénéficiaire seedé dans l’org QA — création impossible.');
    await options.first().click();

    await page.getByTestId('modal-units-input').fill('100');

    // Créer en brouillon (DRAFT)
    await page.getByTestId('submit-draft').click();

    // La modale se ferme après succès
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

    // Un award en "Brouillon" doit apparaître dans la liste (au moins 1)
    await expect(page.getByText('Brouillon').first()).toBeVisible({ timeout: 5_000 });

    // Ouvrir le menu d’actions de la 1ère row puis forcer PROPOSED.
    const firstActions = page.locator('[data-testid^="award-actions-"]').first();
    await expect(firstActions).toBeVisible();
    await firstActions.click();
    const proposeItem = page.getByTestId('force-transition-PROPOSED');
    await expect(proposeItem).toBeVisible({ timeout: 3_000 });
    await proposeItem.click();

    // Le statut "Proposé" doit apparaître (toast + refresh liste).
    await expect(page.getByText('Proposé').first()).toBeVisible({ timeout: 10_000 });
  });
});
