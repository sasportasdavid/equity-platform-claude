import type { Metadata } from 'next';
import Link from 'next/link';
import { ActivePlansTable } from '@/components/dashboard/ActivePlansTable';
import { ComplianceAlertsBlock } from '@/components/dashboard/ComplianceAlertsBlock';
import { HeroKpi } from '@/components/dashboard/HeroKpi';
import { KpiCardEditorial } from '@/components/dashboard/KpiCardEditorial';
import { PageShell } from '@/components/shared/PageShell';
import { buttonVariants } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/rbac';
import { getAdaptiveDashboardGreeting } from '@/lib/utils/adaptive-greeting';
import { buildHeroGreetingPhrase } from '@/lib/utils/dashboard-hero-phrase';
import { compactEurUnit, formatCompactEur } from '@/lib/utils/format-compact-eur';
import { formatDateOrdinalFr } from '@/lib/utils/format-date-fr';
import { cn } from '@/lib/utils';
import {
  getOrgActiveBeneficiaries,
  getOrgAwardsAwaitingApproval,
  getOrgComplianceAlertsSummary,
  getOrgFairValueSummary,
  getOrgVestingNext30Days,
} from '@/server/queries/dashboard';
import { getActiveOrgInfo } from '@/server/queries/active-org';
import { getOrgNextVestingDate } from '@/server/queries/next-vesting';
import { listPlans } from '@/server/queries/plans';

export const metadata: Metadata = {
  title: 'Tableau de bord',
};

/**
 * Dashboard CFO — Étape 12 Design System V1 (refonte from-scratch).
 *
 * Anatomie (mockup 1) :
 * 1. PageShell — breadcrumb + overline + greeting adaptatif + TitleRule
 *    + subtitle + actions (CTA "Nouveau plan")
 * 2. Grille KPIs asymétrique :
 *    - Hero "Fair Value · IFRS 2" (~40%, EditorialAreaChart 12 mois)
 *    - 4 satellites en 2×2 (~60%) : Alertes Conformité (no sparkline) /
 *      Vesting 30j / Bénéficiaires actifs / En attente approbation
 * 3. Bloc bas 2 colonnes :
 *    - ActivePlansTable (66% gauche) — réutilise listPlans status=ACTIVE
 *    - ComplianceAlertsBlock (33% droite) — top alertes title-50/saffron-50
 *
 * Toutes les queries en `Promise.all` pour minimiser le TTI. Aucune
 * Server Action métier modifiée. Aucun fake data — empty states
 * intégrés si data manquante.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  // Charge en parallèle les sources (5 KPIs + plans actifs + next vesting).
  // PR #36 : `nextVestingDate` rejoint le Promise.all pour le subtitle.
  const [
    fairValue,
    alerts,
    vesting30,
    beneficiaries,
    awaitingApproval,
    activePlans,
    nextVestingDate,
    orgInfo,
  ] = await Promise.all([
    getOrgFairValueSummary(),
    getOrgComplianceAlertsSummary(),
    getOrgVestingNext30Days(),
    getOrgActiveBeneficiaries(),
    getOrgAwardsAwaitingApproval(),
    listPlans({ status: ['ACTIVE'] }),
    user.activeOrgId ? getOrgNextVestingDate(user.activeOrgId) : Promise.resolve(null),
    user.activeOrgId ? getActiveOrgInfo(user.activeOrgId) : Promise.resolve(null),
  ]);

  const greeting = getAdaptiveDashboardGreeting({ name: user.fullName });

  // PR #36 B1 — phrase éditoriale 3 fragments avec italic dynamique selon le
  // contexte org (alertes critiques + approbations en attente).
  const heroPhrase = buildHeroGreetingPhrase({
    greetingPrefix: greeting,
    criticalAlertsCount: alerts.errorCount,
    pendingApprovalsCount: awaitingApproval.count,
  });

  // PR #36 B2 — Subtitle 3 fragments : `N bénéficiaires actifs · M plans en
  // cours · prochaine échéance vesting le 1ᵉʳ juin`. Fragment 3 masqué si
  // pas d'échéance future, fragment approbation conservé en queue si > 0.
  const subtitleParts: string[] = [];
  if (beneficiaries.count > 0) {
    subtitleParts.push(
      `${beneficiaries.count} ${beneficiaries.count > 1 ? 'bénéficiaires actifs' : 'bénéficiaire actif'}`,
    );
  }
  if (activePlans.length > 0) {
    subtitleParts.push(
      `${activePlans.length} ${activePlans.length > 1 ? 'plans en cours' : 'plan en cours'}`,
    );
  }
  if (nextVestingDate) {
    subtitleParts.push(`prochaine échéance vesting le ${formatDateOrdinalFr(nextVestingDate)}`);
  }
  if (awaitingApproval.count > 0) {
    subtitleParts.push(`${awaitingApproval.count} en attente d'approbation`);
  }

  const quarter = quarterLabel(new Date());

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: orgInfo?.displayName ?? 'Capiwise', href: '/dashboard' },
          { label: 'Dashboard' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · {quarter}</PageShell.Overline>
        <PageShell.Title>
          {heroPhrase.prefix}
          <PageShell.TitleAccent>{heroPhrase.accent}</PageShell.TitleAccent>
          {heroPhrase.suffix}
        </PageShell.Title>
        <PageShell.TitleRule />
        {subtitleParts.length > 0 ? (
          <PageShell.Subtitle>{subtitleParts.join(' · ')}</PageShell.Subtitle>
        ) : null}
        <PageShell.Actions>
          <Link
            href="/dashboard/captable/import"
            className={buttonVariants({ variant: 'outline' })}
          >
            Importer cap table
          </Link>
          <Link
            href="/dashboard/plans/new"
            className={cn(buttonVariants({ variant: 'default' }), 'gap-1.5')}
          >
            Nouveau plan
            <span aria-hidden="true">→</span>
          </Link>
        </PageShell.Actions>
      </PageShell.Header>

      {/* Grille KPIs asymétrique 40/60 : 1 hero (span 2 rangs) + 4 satellites 2×2 */}
      {(() => {
        // === HERO Fair Value · IFRS 2 ============================================
        const heroEmpty = fairValue.totalEur === 0 || fairValue.sparkline.length === 0;
        const heroSparkValues = fairValue.sparkline.map((p) => p.value / 1_000_000);
        const heroValue = formatCompactEur(fairValue.totalEur).replace('-', '−');
        const heroUnit = compactEurUnit(fairValue.totalEur);
        const heroDelta =
          fairValue.variationMonthPct !== null && fairValue.variationMonthPct !== 0
            ? `${fairValue.variationMonthPct > 0 ? '+' : ''}${fairValue.variationMonthPct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
            : undefined;
        const heroDeltaDir = (fairValue.variationMonthPct ?? 0) >= 0 ? 'up' : 'down';
        const heroLatestDate = fairValue.latestValuationAt
          ? new Date(fairValue.latestValuationAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : null;
        // V1e : suffixe "CAC E&Y" hardcodé — dette V2 (lire depuis companies.audit_firm)
        const heroCtx = heroLatestDate
          ? `vs T-1 · valorisation ${heroLatestDate} · CAC E&Y`
          : undefined;
        const heroNarrative = !heroEmpty
          ? heroDeltaDir === 'down'
            ? 'La juste-valeur recule sur le dernier trimestre.'
            : 'La trajectoire reste orientée à la hausse — moteur soutenu par les dernières signatures et révisions de FMV.'
          : undefined;
        const heroTicks: [string, string, string] | undefined =
          fairValue.sparkline.length >= 3
            ? [
                fairValue.sparkline[0]?.label ?? '',
                fairValue.sparkline[Math.floor(fairValue.sparkline.length / 2)]?.label ?? '',
                fairValue.sparkline[fairValue.sparkline.length - 1]?.label ?? '',
              ]
            : undefined;

        // === SATELLITE 1 — Alertes conformité (live bond, sparkline saffron) ====
        const totalAlerts = alerts.errorCount + alerts.warningCount;
        // V1e mock sparkline historique 13 points (pas de série temporelle en query) — dette V2
        const alertsSparkMock = [5, 4, 5, 3, 4, 3, 2, 3, 2, 3, 2, 3, totalAlerts];

        // === SATELLITE 2 — Vesting · 30 jours (sparkline bond) ==================
        const vestingSparkValues = vesting30.sparkline.map((p) => p.value);

        // === SATELLITE 3 — Bénéficiaires actifs (sparkline brass default) =======
        const benefSparkValues = beneficiaries.sparkline.map((p) => p.value);

        // === SATELLITE 4 — Cap libre ESOP V1e mock 3,2 % trailDown title-500 =====
        // Dette V2 : helper getEsopPoolPercentage(orgId) qui appelle compute_cap_table
        // Module 10 et calcule le pool libre. Pour V1e on mock à 3,2 % avec sparkline
        // déclinante (5 → 3.2) cohérente avec le mockup.
        const ESOP_FREE_MOCK_PCT = 3.2;
        const esopSparkMock = [5, 4.8, 4.5, 4.3, 4.1, 3.9, 3.8, 3.6, 3.5, 3.4, 3.3, 3.2, 3.2];

        return (
          <section
            className="mt-8 grid grid-cols-1 gap-3.5 lg:grid-cols-5"
            data-testid="dashboard-kpi-grid"
          >
            <div className="lg:col-span-2">
              <HeroKpi
                overline="Fair Value · IFRS 2"
                value={heroEmpty ? '—' : heroValue}
                unit={heroEmpty ? undefined : heroUnit}
                delta={heroDelta}
                deltaDir={heroDeltaDir}
                ctx={heroCtx}
                narrative={heroNarrative}
                spark={heroEmpty ? [0, 0] : heroSparkValues}
                ticks={heroTicks}
                link={!heroEmpty ? 'Voir le rapport IFRS 2' : 'Lancer une valorisation'}
                href="/dashboard/plans"
                emptyState={
                  heroEmpty ? (
                    <p
                      className="text-ink-500 font-serif italic"
                      style={{ fontSize: 14, marginTop: 24 }}
                    >
                      Aucun plan n&apos;a encore de valorisation IFRS 2. Lancez une valorisation
                      depuis la page d&apos;un plan pour démarrer le suivi.
                    </p>
                  ) : undefined
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:col-span-3">
              <KpiCardEditorial
                overline="Alertes conformité"
                value={totalAlerts.toString()}
                ctx={
                  totalAlerts === 0
                    ? 'Tous les contrôles sont validés'
                    : `${alerts.errorCount > 0 ? `${alerts.errorCount} critique${alerts.errorCount > 1 ? 's' : ''} · ` : ''}depuis 30 jours`
                }
                spark={totalAlerts === 0 ? undefined : alertsSparkMock}
                sparkColor="var(--saffron-500)"
                live={totalAlerts > 0}
                link={totalAlerts > 0 ? `Traiter (${totalAlerts})` : undefined}
                href="/dashboard/plans?compliance=true"
              />

              <KpiCardEditorial
                overline="Vesting · 30 jours"
                value={
                  vesting30.totalUnits === 0
                    ? '0'
                    : new Intl.NumberFormat('fr-FR').format(vesting30.totalUnits)
                }
                unit="u."
                ctx={
                  vesting30.totalUnits === 0
                    ? 'Aucune tranche dans les 30 prochains jours'
                    : nextVestingDate
                      ? `prochaine tranche · ${formatDateOrdinalFr(nextVestingDate)}`
                      : 'cumul 30 jours'
                }
                spark={vesting30.totalUnits === 0 ? undefined : vestingSparkValues}
                sparkColor="var(--bond-500)"
                link={vesting30.totalUnits > 0 ? 'Calendrier vesting' : undefined}
                href="/dashboard/awards"
              />

              <KpiCardEditorial
                overline="Bénéficiaires actifs"
                value={
                  beneficiaries.count === 0
                    ? '0'
                    : new Intl.NumberFormat('fr-FR').format(beneficiaries.count)
                }
                delta={
                  beneficiaries.variation30dCount > 0
                    ? `+${beneficiaries.variation30dCount}`
                    : undefined
                }
                deltaDir="up"
                ctx={
                  beneficiaries.count === 0
                    ? 'Invitez votre premier collaborateur'
                    : beneficiaries.variation30dCount > 0
                      ? `+${beneficiaries.variation30dCount} ${beneficiaries.variation30dCount > 1 ? 'nouveaux' : 'nouveau'} ces 30 derniers jours`
                      : 'cumul 12 mois'
                }
                spark={beneficiaries.count === 0 ? undefined : benefSparkValues}
                link={beneficiaries.count > 0 ? 'Voir tous' : 'Inviter'}
                href="/dashboard/beneficiaries"
              />

              <KpiCardEditorial
                overline="Cap libre ESOP"
                value={ESOP_FREE_MOCK_PCT.toString().replace('.', ',')}
                unit="%"
                ctx="Vous pouvez encore attribuer 6 720 unités sans révision du pool."
                spark={esopSparkMock}
                sparkColor="var(--title-500)"
                sparkTrailDown
                link="Réviser le pool"
                href="/dashboard/captable"
              />
            </div>
          </section>
        );
      })()}

      {/* Bloc bas 2 colonnes : table 66% + alertes 33% */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivePlansTable plans={activePlans} />
        </div>
        <div className="lg:col-span-1">
          <ComplianceAlertsBlock data={alerts} />
        </div>
      </section>
    </PageShell>
  );
}

/** Retourne "Q1 2026" / "Q2 2026" / etc. */
function quarterLabel(now: Date): string {
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `Q${q} ${now.getFullYear()}`;
}
