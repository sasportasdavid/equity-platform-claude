import Link from 'next/link';
import { Plus } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type {
  ActiveBeneficiariesSummary,
  AwardsAwaitingApprovalSummary,
  ComplianceAlertsSummary,
  FairValueSummary,
  VestingNext30DaysSummary,
} from '@/server/queries/dashboard';
import type { PlanListRow } from '@/server/queries/plans';

export const metadata = { title: 'Dev — Dashboard Preview' };

/**
 * Sandbox /dev/design/dashboard-preview — Étape 12 Design System V1.
 *
 * Rend le Dashboard CFO refondu avec des données 100% mockées pour
 * permettre le visual check sans avoir une session admin authentifiée.
 *
 * **Important** : ce fichier ne consomme AUCUNE query métier (pas de
 * `getOrgFairValueSummary`, etc.). Les données sont des fixtures inline.
 * La vraie page (`/dashboard`) consomme les queries SSR.
 *
 * Couvert par cette preview :
 * - Hero card "Fair Value · IFRS 2" 12,4 M€ avec sparkline 12 mois
 * - 4 KPI satellites : Alertes (3 actifs ERROR+WARNING), Vesting 30j
 *   (847 u.), Bénéficiaires (142 +5), Approbations (3 en attente)
 * - DataTable plans actifs avec 4 lignes
 * - Bloc alertes éditorial avec 3 cards (1 ERROR + 2 WARNING)
 */

// ============================================================================
// Fixtures
// ============================================================================

const fairValueData: FairValueSummary = {
  totalEur: 12_450_000,
  variationMonthPct: 4.2,
  latestValuationAt: '2026-04-30T14:32:00Z',
  sparkline: [
    { label: 'Mai 2025', value: 8_450_000 },
    { label: 'Juin', value: 8_920_000 },
    { label: 'Juil', value: 9_280_000 },
    { label: 'Août', value: 9_650_000 },
    { label: 'Sept', value: 10_120_000 },
    { label: 'Oct', value: 10_540_000 },
    { label: 'Nov', value: 10_870_000 },
    { label: 'Déc', value: 11_180_000 },
    { label: 'Jan 2026', value: 11_450_000 },
    { label: 'Fév', value: 11_710_000 },
    { label: 'Mar', value: 11_950_000 },
    { label: 'Avr 2026', value: 12_450_000 },
  ],
};

const alertsData: ComplianceAlertsSummary = {
  errorCount: 1,
  warningCount: 2,
  lastCheckAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // il y a 4 h
  topAlerts: [
    {
      resourceType: 'PLAN',
      resourceId: 'plan-1',
      resourceName: 'BSPCE-2024-001 · Tranche A',
      severity: 'ERROR',
      code: 'BSPCE_BENEFICIARY_TYPE',
      message: 'Un consultant non éligible BSPCE a une attribution active sur ce plan.',
    },
    {
      resourceType: 'PLAN',
      resourceId: 'plan-2',
      resourceName: 'AGA-2025-014 · Direction Ops',
      severity: 'WARNING',
      code: 'AGA_30_PERCENT_CAP',
      message: "L'allocation AGA approche de la limite des 30 % du capital.",
    },
    {
      resourceType: 'AWARD',
      resourceId: 'award-7',
      resourceName: 'BSPCE-2026-001 · A-001234',
      severity: 'WARNING',
      code: 'GRANT_DATE_RECENT',
      message: "Date d'attribution antérieure de plus de 60 jours à la valorisation FMV.",
    },
  ],
};

const vesting30Data: VestingNext30DaysSummary = {
  totalUnits: 847,
  sparkline: Array.from({ length: 30 }, (_, i) => ({
    label: i === 0 ? 'Auj.' : `J+${i}`,
    value: Math.min(847, Math.round((i / 30) * 950 + Math.sin(i / 3) * 30)),
  })),
};

const beneficiariesData: ActiveBeneficiariesSummary = {
  count: 142,
  variation30dCount: 5,
  sparkline: [
    { label: 'Mai 2025', value: 118 },
    { label: 'Juin', value: 121 },
    { label: 'Juil', value: 124 },
    { label: 'Août', value: 126 },
    { label: 'Sept', value: 128 },
    { label: 'Oct', value: 130 },
    { label: 'Nov', value: 132 },
    { label: 'Déc', value: 134 },
    { label: 'Jan 2026', value: 137 },
    { label: 'Fév', value: 138 },
    { label: 'Mar', value: 140 },
    { label: 'Avr 2026', value: 142 },
  ],
};

const awaitingApprovalData: AwardsAwaitingApprovalSummary = {
  count: 3,
  sparkline: Array.from({ length: 30 }, (_, i) => ({
    label: i === 29 ? 'Auj.' : `J-${29 - i}`,
    value: Math.max(0, Math.round(Math.sin((i + 1) / 4) * 2 + 1)),
  })),
};

const activePlansData: PlanListRow[] = [
  {
    id: 'p1',
    name: 'BSPCE-2026-001 · Tranche A',
    description: null,
    plan_type: 'BSPCE',
    status: 'ACTIVE',
    pool_size: 50_000,
    pool_allocated: 32_400,
    pool_vested: 8_200,
    exercise_price: 24,
    board_date: '2026-01-15',
    grant_date: '2026-01-15',
    is_locked: false,
    version: 1,
    created_at: '2026-01-15T10:00:00Z',
    company: { id: 'c1', name: 'Paragraphe SAS' },
  },
  {
    id: 'p2',
    name: 'AGA-2025-014 · Direction Ops',
    description: null,
    plan_type: 'AGA',
    status: 'ACTIVE',
    pool_size: 12_000,
    pool_allocated: 8_750,
    pool_vested: 2_400,
    exercise_price: null,
    board_date: '2025-09-10',
    grant_date: '2025-09-10',
    is_locked: false,
    version: 1,
    created_at: '2025-09-10T10:00:00Z',
    company: { id: 'c1', name: 'Paragraphe SAS' },
  },
  {
    id: 'p3',
    name: 'BSPCE-2025-007 · Sales Q3',
    description: null,
    plan_type: 'BSPCE',
    status: 'ACTIVE',
    pool_size: 18_000,
    pool_allocated: 14_200,
    pool_vested: 6_700,
    exercise_price: 18,
    board_date: '2025-07-01',
    grant_date: '2025-07-01',
    is_locked: false,
    version: 1,
    created_at: '2025-07-01T10:00:00Z',
    company: { id: 'c1', name: 'Paragraphe SAS' },
  },
  {
    id: 'p4',
    name: 'SO-2024-002 · Founders pool',
    description: null,
    plan_type: 'STOCK_OPTION',
    status: 'ACTIVE',
    pool_size: 100_000,
    pool_allocated: 100_000,
    pool_vested: 75_000,
    exercise_price: 12,
    board_date: '2024-04-15',
    grant_date: '2024-04-15',
    is_locked: true,
    version: 1,
    created_at: '2024-04-15T10:00:00Z',
    company: { id: 'c1', name: 'Paragraphe SAS' },
  },
];

// ============================================================================
// Page sandbox
// ============================================================================

export default function DashboardPreviewPage() {
  return (
    <PageShell>
      <PageShell.Breadcrumb items={[{ label: 'Capiwise' }, { label: 'Dashboard CFO' }]} />

      <PageShell.Header>
        <PageShell.Overline>EQUITY MANAGEMENT · Q2 2026</PageShell.Overline>
        <PageShell.Title>
          Bonjour Marie, <PageShell.TitleAccent>voici votre vue Q2 2026</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          142 bénéficiaires · 4 plans actifs · 3 en attente d&apos;approbation
        </PageShell.Subtitle>
        <PageShell.Actions>
          <Link
            href="/dashboard/plans/new"
            className={cn(buttonVariants({ variant: 'default' }), 'gap-2')}
          >
            <Plus className="size-4" strokeWidth={1.75} />
            Nouveau plan
          </Link>
        </PageShell.Actions>
      </PageShell.Header>

      {/* Grille KPIs asymétrique : 1 hero ~40% + 4 satellites 2×2 ~60% */}
      <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <HeroFairValueCard data={fairValueData} href="/dashboard/plans" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
          <ComplianceAlertsKPI data={alertsData} />
          <VestingNext30DaysKPI data={vesting30Data} />
          <ActiveBeneficiariesKPI data={beneficiariesData} />
          <AwardsAwaitingApprovalKPI data={awaitingApprovalData} />
        </div>
      </section>

      {/* Bloc bas 2 colonnes : table 66% + alertes 33% */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivePlansTable plans={activePlansData} />
        </div>
        <div className="lg:col-span-1">
          <ComplianceAlertsBlock data={alertsData} />
        </div>
      </section>
    </PageShell>
  );
}
