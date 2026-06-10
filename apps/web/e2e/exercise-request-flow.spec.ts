import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Pre-launch hardening — E2E exercise-request-flow (Module 9).
 *
 * Côté portail BENEFICIARY : depuis le détail d'un award exerçable
 * (BSPCE/SO/BSA), on ouvre le formulaire d'exercice et on vérifie le
 * simulateur fiscal live. On tente la soumission et on vérifie la demande
 * en attente (PENDING) dans le suivi.
 *
 * Selectors (data-testid réels) :
 *   - portal-award-detail, exercise-cta-section, cta-tax-simulator,
 *     cta-exercise-new (app/portal/awards/[id]/page.tsx)
 *   - exercise-new-page, form-units-input, form-submit-button
 *     (ExerciseRequestForm) ; le breakdown fiscal live s'affiche dès units>0
 *   - tax-simulator-page, simulator-units-input (TaxSimulator)
 *   - portal-exercises-list-page, exercise-row-{id} (app/portal/exercises)
 *   - ExerciseRequestStatusBadge PENDING → "En attente"
 *
 * Robustesse : le test EFFECTUE potentiellement une mutation (soumission
 * d'une demande d'exercice). Si aucun award exerçable n'est seedé (pas de
 * CTA), les sous-tests se skippent. Pas de cleanup DB (seed QA partagée).
 */

test.describe('Exercise request flow — portail (Module 9)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'BENEFICIARY');
  });

  /** Ouvre le 1er award exerçable et renvoie true si un CTA exercise existe. */
  async function openExercisableAward(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/portal/awards');
    const card = page.locator('[data-testid^="portal-award-card-"]').first();
    if (!(await card.isVisible({ timeout: 3_000 }).catch(() => false))) return false;
    await card.click();
    await expect(page.getByTestId('portal-award-detail')).toBeVisible({ timeout: 10_000 });
    // La section CTA exercise n'apparaît que pour BSPCE/SO/BSA + statut OK.
    return page
      .getByTestId('exercise-cta-section')
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
  }

  test('la liste de suivi des exercices rend', async ({ page }) => {
    await page.goto('/portal/exercises');
    await expect(page.getByTestId('portal-exercises-list-page')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('ouvre le simulateur fiscal depuis un award exerçable', async ({ page }) => {
    const hasCta = await openExercisableAward(page);
    test.skip(!hasCta, 'Aucun award exerçable seedé pour le bénéficiaire QA.');

    await page.getByTestId('cta-tax-simulator').click();
    await expect(page.getByTestId('tax-simulator-page')).toBeVisible({ timeout: 10_000 });
    // Le simulateur expose un slider/input d'unités + un breakdown live.
    await expect(page.getByTestId('simulator-units-input')).toBeVisible({ timeout: 5_000 });
  });

  test('ouvre le form d’exercice, voit le breakdown fiscal et soumet → PENDING', async ({
    page,
  }) => {
    const hasCta = await openExercisableAward(page);
    test.skip(!hasCta, 'Aucun award exerçable seedé pour le bénéficiaire QA.');

    // Le bouton "Exercer" n'est présent que si des unités sont disponibles.
    const ctaNew = page.getByTestId('cta-exercise-new');
    const canExercise = await ctaNew.isVisible({ timeout: 2_000 }).catch(() => false);
    test.skip(!canExercise, 'Aucune unité exerçable (units disponibles = 0).');

    await ctaNew.click();
    await expect(page.getByTestId('exercise-new-page')).toBeVisible({ timeout: 10_000 });

    // Saisir un nombre d'unités → le breakdown fiscal live doit apparaître.
    const unitsInput = page.getByTestId('form-units-input');
    await expect(unitsInput).toBeVisible();
    await unitsInput.fill('1');

    // Estimation fiscale live (TaxBreakdownDisplay rendu dans la section
    // "Estimation des impôts à payer").
    await expect(page.getByText(/Estimation des impôts à payer/i)).toBeVisible({ timeout: 5_000 });

    // Soumettre la demande.
    const submit = page.getByTestId('form-submit-button');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Après soumission : redirect vers la liste/le détail de la demande.
    // On vérifie l'arrivée sur une page d'exercice + un statut "En attente".
    await expect(page).toHaveURL(/\/portal\/exercises/, { timeout: 15_000 });
    await expect(page.getByText('En attente').first()).toBeVisible({ timeout: 10_000 });
  });
});
