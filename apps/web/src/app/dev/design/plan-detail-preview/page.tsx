import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EditorialSynthesisTab } from '@/components/plans/detail/EditorialSynthesisTab';
import { PageShell } from '@/components/shared/PageShell';
import { StatusBadge } from '@/components/ui/status-badge';
import { getAdaptivePlanTitle } from '@/lib/utils/adaptive-plan-title';
import type { AwardListRow } from '@/server/queries/awards';
import type { PlanDetail } from '@/server/queries/plans';

export const metadata = { title: 'Dev — Plan Detail Preview' };

/**
 * Sandbox /dev/design/plan-detail-preview — Étape 13 commit 6/6.
 *
 * Rend 4 fixtures de Plan Detail pour valider visuellement les 4 états
 * du titre adaptatif :
 *  1. pre-cliff
 *  2. vesting-active
 *  3. fully-vested
 *  4. closed
 *
 * Chaque fixture rend uniquement le PageShell header editorial + le
 * Synthesis tab refondu (les 7 autres onglets ne sont pas dans la
 * refonte Étape 13).
 */

// ============================================================================
// Helpers fixture
// ============================================================================

type FixtureSpec = {
  label: string;
  description: string;
  plan: PlanDetail['plan'];
  vestingSchedule: PlanDetail['vestingSchedule'];
  conditions: PlanDetail['conditions'];
  awards: AwardListRow[];
  company: PlanDetail['company'];
};

function buildPlan(overrides: Partial<PlanDetail['plan']>): PlanDetail['plan'] {
  return {
    id: 'plan-' + Math.random(),
    name: 'BSPCE-2026-001',
    description: null,
    plan_type: 'BSPCE',
    settlement_type: 'EQUITY',
    status: 'ACTIVE',
    version: 1,
    is_locked: false,
    pool_size: 50_000,
    pool_allocated: 32_400,
    pool_vested: 0,
    pool_exercised: 0,
    pool_cancelled: 0,
    exercise_price: 24,
    reference_share_price: 312,
    board_date: '2026-01-15',
    grant_date: '2026-01-15',
    shareholder_meeting_date: '2025-12-15',
    shareholder_authorization_expires_at: null,
    performance_combination_type: 'AND',
    performance_evaluation_moment: 'END',
    performance_failure_action: 'FORFEIT',
    parent_plan_id: null,
    compliance_warnings: [],
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    created_by: null,
    ...overrides,
  };
}

function buildSchedule(
  grant: string,
  cliffMonths: number,
  totalMonths: number,
  cliffPct = 25,
): PlanDetail['vestingSchedule'] {
  const tranches: PlanDetail['vestingSchedule'] extends infer T
    ? T extends { tranches: infer U }
      ? U
      : never
    : never = [] as never;

  const grantDate = new Date(grant);
  const numTranches = Math.floor(totalMonths / 12);
  const arr: {
    id: string;
    sort_order: number;
    vesting_date: string;
    percentage_of_award: number;
  }[] = [];
  for (let i = 0; i < numTranches; i++) {
    const monthsOffset = cliffMonths + i * 12;
    const d = new Date(
      grantDate.getFullYear(),
      grantDate.getMonth() + monthsOffset,
      grantDate.getDate(),
    );
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    arr.push({
      id: `tr-${i}`,
      sort_order: i,
      vesting_date: iso,
      percentage_of_award: i === 0 ? cliffPct : Math.round((100 - cliffPct) / (numTranches - 1)),
    });
  }
  return {
    id: 'sched-1',
    vesting_type: 'CLIFF_LINEAR',
    cliff_months: cliffMonths,
    cliff_percentage: cliffPct,
    total_months: totalMonths,
    frequency: 'YEARLY',
    linear_after_cliff: true,
    single_vesting_date: null,
    tranches: arr,
  };
}

function buildAward(idx: number, status: string, units: number): AwardListRow {
  return {
    id: `aw-${idx}`,
    award_number: `A-00${idx}`,
    status,
    units_granted: units,
    units_vested: status === 'VESTED' || status === 'EXERCISED' ? units : 0,
    exercise_price: 24,
    grant_date: '2026-01-15',
    vesting_start_date: '2026-01-15',
    created_at: '2026-01-15T10:00:00Z',
    plan: { id: 'plan-1', name: 'BSPCE-2026-001', plan_type: 'BSPCE', is_locked: false },
    beneficiary: {
      id: `b-${idx}`,
      first_name: ['Marie', 'Julien', 'Élise', 'Pierre', 'Sophie'][idx % 5] ?? 'User',
      last_name: ['Lambert', 'Doe', 'Marin', 'Durand', 'Bernard'][idx % 5] ?? 'X',
      email: `user${idx}@paragraphe.fr`,
      beneficiary_type: 'EMPLOYEE',
    },
  };
}

const company: PlanDetail['company'] = {
  id: 'c1',
  name: 'Paragraphe SAS',
  country_code: 'FR',
  ticker: null,
};

// ============================================================================
// 4 fixtures (4 états)
// ============================================================================

const FIXTURES: FixtureSpec[] = [
  {
    label: 'Pré-cliff',
    description:
      "Plan signé le 15.01.2026, cliff 12 mois. Aujourd'hui (mai 2026) → 8 mois avant le cliff.",
    plan: buildPlan({
      name: 'BSPCE-2026-001 · Tranche A',
      grant_date: '2026-01-15',
      board_date: '2026-01-15',
      reference_share_price: 312,
    }),
    vestingSchedule: buildSchedule('2026-01-15', 12, 48),
    conditions: [
      {
        id: 'cond-1',
        name: 'ARR > 12 M€',
        condition_type: 'NON_MARKET',
        category: 'FINANCIAL',
        weight: 100,
        enable_partial_scoring: true,
        metric: 'ARR',
        target_value: '12000000',
        target_unit: 'EUR',
        comparison_operator: 'GTE',
        threshold_min: null,
        threshold_max: null,
        market_metric_type: null,
        reference_index: null,
        reference_index_display_name: null,
        comparison_method: null,
        measurement_period_years: null,
        performance_start_date: null,
        performance_end_date: null,
        start_price_method: null,
        end_price_method: null,
        start_fixed_price: null,
        end_fixed_price: null,
        start_averaging_days: null,
        end_averaging_days: null,
        peer_group: [],
        weighted_peer_groups: [],
        acquisition_scale: [],
      },
    ],
    awards: [
      buildAward(1, 'PROPOSED', 1200),
      buildAward(2, 'APPROVED', 800),
      buildAward(3, 'PENDING_APPROVAL', 1500),
    ],
    company,
  },
  {
    label: 'Vesting actif',
    description:
      'Plan signé le 01.09.2023, cliff 12 mois (passé 01.09.2024). Today entre 2e et 3e tranche.',
    plan: buildPlan({
      name: 'BSPCE-2023-008 · Sales',
      grant_date: '2023-09-01',
      board_date: '2023-09-01',
      reference_share_price: 156,
      exercise_price: 18,
      pool_size: 18_000,
      pool_allocated: 14_200,
    }),
    vestingSchedule: buildSchedule('2023-09-01', 12, 48),
    conditions: [],
    awards: [
      buildAward(4, 'GRANTED', 2400),
      buildAward(5, 'VESTED', 1800),
      buildAward(6, 'GRANTED', 1500),
      buildAward(7, 'GRANTED', 800),
    ],
    company,
  },
  {
    label: 'Fully-vested',
    description: 'Plan signé le 01.12.2019, terminé 01.12.2023. Toutes tranches passées.',
    plan: buildPlan({
      name: 'SO-2019-001 · Founders pool',
      plan_type: 'STOCK_OPTION',
      grant_date: '2019-12-01',
      board_date: '2019-12-01',
      reference_share_price: 285,
      exercise_price: 12,
      pool_size: 100_000,
      pool_allocated: 100_000,
      pool_vested: 100_000,
    }),
    vestingSchedule: buildSchedule('2019-12-01', 12, 48),
    conditions: [],
    awards: [
      buildAward(8, 'EXERCISED', 25000),
      buildAward(9, 'VESTED', 25000),
      buildAward(10, 'VESTED', 30000),
      buildAward(11, 'VESTED', 20000),
    ],
    company,
  },
  {
    label: 'Clôturé',
    description: 'Plan retiré, status CLOSED. Le titre passe en "clôturé en {Mois Année}".',
    plan: buildPlan({
      name: 'AGA-2024-013 · Direction Ops (déprécié)',
      plan_type: 'AGA',
      status: 'CLOSED',
      grant_date: '2024-04-15',
      board_date: '2024-04-15',
      reference_share_price: null,
      exercise_price: null,
      pool_size: 12_000,
      pool_allocated: 8_750,
    }),
    vestingSchedule: buildSchedule('2024-04-15', 12, 48),
    conditions: [],
    awards: [buildAward(12, 'CANCELLED', 4000), buildAward(13, 'CANCELLED', 4750)],
    company,
  },
];

// ============================================================================
// Page sandbox
// ============================================================================

const PLAN_TYPE_LABEL_MAP: Record<string, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Option',
};

const PLAN_TYPE_TONE_MAP: Record<string, 'brass' | 'bond' | 'saffron' | 'slate'> = {
  BSPCE: 'brass',
  AGA: 'bond',
  STOCK_OPTION: 'saffron',
};

const PLAN_STATUS_LABEL_MAP: Record<string, { label: string; tone: 'bond' | 'slate' }> = {
  ACTIVE: { label: 'Actif', tone: 'bond' },
  CLOSED: { label: 'Clôturé', tone: 'slate' },
};

export default function PlanDetailPreviewPage() {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-paper-300 border-b px-8 py-4">
        <Link
          href="/dev/design"
          className="text-ink-500 hover:text-ink-900 inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          /dev/design
        </Link>
        <p className="text-overline text-brass-500 mt-3">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          Plan Detail <span className="serif-italic text-brass-500">4 états adaptatifs</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
      </header>

      <div className="space-y-16 p-8">
        {FIXTURES.map((fx, idx) => {
          const fullDetail: PlanDetail = {
            plan: fx.plan,
            company: fx.company,
            vestingSchedule: fx.vestingSchedule,
            conditions: fx.conditions,
            leavers: [],
            hypothesisSets: [],
            valuationRuns: [],
            latestValuation: null,
            latestIfrs2: null,
            versions: [],
          };

          const lastTrancheDate =
            fx.vestingSchedule?.tranches && fx.vestingSchedule.tranches.length > 0
              ? fx.vestingSchedule.tranches.reduce((acc, t) =>
                  t.vesting_date > acc.vesting_date ? t : acc,
                ).vesting_date
              : null;

          const adaptiveTitle = getAdaptivePlanTitle({
            plan: {
              name: fx.plan.name,
              status: fx.plan.status,
              grant_date: fx.plan.grant_date,
            },
            vestingSchedule: fx.vestingSchedule
              ? {
                  cliff_months: fx.vestingSchedule.cliff_months,
                  last_tranche_date: lastTrancheDate,
                }
              : null,
          });

          const planTypeLabel = PLAN_TYPE_LABEL_MAP[fx.plan.plan_type] ?? fx.plan.plan_type;
          const planTypeTone = PLAN_TYPE_TONE_MAP[fx.plan.plan_type] ?? 'slate';
          const planStatusCfg = PLAN_STATUS_LABEL_MAP[fx.plan.status] ?? {
            label: fx.plan.status,
            tone: 'slate' as const,
          };

          return (
            <section key={idx} className="space-y-6">
              <div className="border-paper-300 border-l-[3px] pl-4">
                <p className="text-overline text-brass-500">FIXTURE {idx + 1}</p>
                <h2 className="text-h2 text-ink-900">
                  Cas — <span className="serif-italic text-brass-500">{fx.label}</span>
                </h2>
                <p className="text-ink-500 mt-2 text-sm">{fx.description}</p>
                <p className="text-ink-400 mt-1 font-mono text-xs">
                  state = <code>{adaptiveTitle.state}</code>
                </p>
              </div>

              <PageShell>
                <PageShell.Breadcrumb
                  items={[
                    { label: 'Capiwise' },
                    { label: 'Plans', href: '/dashboard/plans' },
                    { label: fx.plan.name },
                  ]}
                />
                <PageShell.Header>
                  <PageShell.Overline>PLAN · {planTypeLabel.toUpperCase()}</PageShell.Overline>
                  <PageShell.Title>
                    {adaptiveTitle.prefix}
                    <PageShell.TitleAccent>{adaptiveTitle.accent}</PageShell.TitleAccent>
                  </PageShell.Title>
                  <PageShell.TitleRule />
                  <PageShell.Subtitle>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <StatusBadge tone={planStatusCfg.tone} pattern="solid">
                        {planStatusCfg.label}
                      </StatusBadge>
                      <StatusBadge tone={planTypeTone} pattern="solid">
                        {planTypeLabel}
                      </StatusBadge>
                      <span className="text-ink-500 ml-1 font-mono text-xs">
                        Pool {new Intl.NumberFormat('fr-FR').format(fx.plan.pool_size)} u. ·{' '}
                        {fx.company?.name} · v{fx.plan.version}
                      </span>
                    </span>
                  </PageShell.Subtitle>
                </PageShell.Header>

                <EditorialSynthesisTab detail={fullDetail} planAwards={fx.awards} />
              </PageShell>
            </section>
          );
        })}
      </div>
    </div>
  );
}
