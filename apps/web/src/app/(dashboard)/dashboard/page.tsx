import type { Metadata } from 'next';
import Link from 'next/link';
import { ActivePlansTable } from '@/components/dashboard/ActivePlansTable';
import { ComplianceAlertsBlock } from '@/components/dashboard/ComplianceAlertsBlock';
import { HeroFairValueCard } from '@/components/dashboard/HeroFairValueCard';
import {
  ActiveBeneficiariesKPI,
  AwardsAwaitingApprovalKPI,
  ComplianceAlertsKPI,
  VestingNext30DaysKPI,
} from '@/components/dashboard/SatelliteKpis';
import { PageShell } from '@/components/shared/PageShell';
import { buttonVariants } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/rbac';
import { getAdaptiveDashboardGreeting } from '@/lib/utils/adaptive-greeting';
import { buildHeroGreetingPhrase } from '@/lib/utils/dashboard-hero-phrase';
import { formatDateOrdinalFr } from '@/lib/utils/format-date-fr';
import { cn } from '@/lib/utils';
import {
  getOrgActiveBeneficiaries,
  getOrgAwardsAwaitingApproval,
  getOrgComplianceAlertsSummary,
  getOrgFairValueSummary,
  getOrgVestingNext30Days,
} from '@/server/queries/dashboard';
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
  ] = await Promise.all([
    getOrgFairValueSummary(),
    getOrgComplianceAlertsSummary(),
    getOrgVestingNext30Days(),
    getOrgActiveBeneficiaries(),
    getOrgAwardsAwaitingApproval(),
    listPlans({ status: ['ACTIVE'] }),
    user.activeOrgId ? getOrgNextVestingDate(user.activeOrgId) : Promise.resolve(null),
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
      <PageShell.Breadcrumb items={[{ label: 'Capiwise' }, { label: 'Dashboard CFO' }]} />

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

      {/* Grille KPIs asymétrique : 1 hero ~40% + 4 satellites 2×2 ~60% */}
      <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <HeroFairValueCard data={fairValue} href="/dashboard/plans" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
          <ComplianceAlertsKPI data={alerts} />
          <VestingNext30DaysKPI data={vesting30} />
          <ActiveBeneficiariesKPI data={beneficiaries} />
          <AwardsAwaitingApprovalKPI data={awaitingApproval} />
        </div>
      </section>

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
