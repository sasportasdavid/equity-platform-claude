import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Pre-launch hardening — E2E portal-beneficiary-smoke (Module 8).
 *
 * Le bénéficiaire est le public de la beta privée : smoke robuste sur le
 * portail. On vérifie :
 *   1. Login BENEFICIARY → /portal redirige vers /portal/awards (liste).
 *   2. La liste des awards rend (data-testid="portal-awards-list").
 *   3. Si au moins 1 award est seedé : ouvrir la card → page détail
 *      (data-testid="portal-award-detail") + chronologie de vesting
 *      (VestingTimeline / portal-vesting-chart).
 *
 * Selectors (data-testid réels) :
 *   - portal-awards-list (app/portal/awards/page.tsx)
 *   - portal-award-card-{id} (AwardSummaryCard, Link)
 *   - portal-award-detail (app/portal/awards/[id]/page.tsx)
 *   - vesting-timeline (components/awards/vesting-timeline.tsx, via
 *     EditorialVestingSection) — fallback portal-vesting-chart (VestingChart)
 *
 * Robustesse : aucune mutation. Si l'org QA n'a pas de bénéficiaire seedé
 * avec des awards, les sous-tests de détail se skippent proprement.
 */

test.describe('Portal bénéficiaire — smoke (Module 8)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'BENEFICIARY');
  });

  test('/portal redirige vers la liste des awards et la rend', async ({ page }) => {
    await page.goto('/portal');
    // PortalIndex redirige vers /portal/awards
    await expect(page).toHaveURL(/\/portal\/awards/, { timeout: 10_000 });
    await expect(page.getByTestId('portal-awards-list')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('ouvre un award (si seedé) → détail + chronologie de vesting', async ({ page }) => {
    await page.goto('/portal/awards');
    await expect(page.getByTestId('portal-awards-list')).toBeVisible({ timeout: 5_000 });

    const firstCard = page.locator('[data-testid^="portal-award-card-"]').first();
    const hasAward = await firstCard.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(!hasAward, 'Aucun award seedé pour le bénéficiaire QA — détail non testable.');

    await firstCard.click();

    // Page détail
    await expect(page).toHaveURL(/\/portal\/awards\/[0-9a-f-]{8,}/, { timeout: 10_000 });
    await expect(page.getByTestId('portal-award-detail')).toBeVisible({ timeout: 5_000 });

    // Chronologie de vesting : VestingTimeline OU chart Recharts.
    const timeline = page.getByTestId('vesting-timeline').first();
    const chart = page.getByTestId('portal-vesting-chart');
    const timelineVisible = await timeline.isVisible({ timeout: 3_000 }).catch(() => false);
    const chartVisible = await chart.isVisible({ timeout: 1_000 }).catch(() => false);
    expect(
      timelineVisible || chartVisible,
      'Ni la timeline ni le chart de vesting ne sont visibles sur le détail',
    ).toBe(true);
  });

  test('le portail charge sans erreur runtime (heading + nav)', async ({ page }) => {
    await page.goto('/portal/awards');
    // La présence du heading prouve que le RSC + layout portail ont rendu
    // (auth + check beneficiary du layout passés).
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 5_000 });
  });
});
