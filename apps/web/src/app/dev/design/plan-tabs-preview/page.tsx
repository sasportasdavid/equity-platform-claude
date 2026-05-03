import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PlanDetailClient } from '@/app/(dashboard)/dashboard/plans/[id]/plan-detail-client';
import type { PlanDetail } from '@/server/queries/plans';

export const metadata = { title: 'Dev — Plan Detail Tabs Preview' };

/**
 * Sandbox /dev/design/plan-tabs-preview — Étape 14 commit final.
 *
 * Rend PlanDetailClient complet avec PlanDetail mocké pour permettre
 * la validation visuelle des **7 onglets non refondus** (État,
 * Performance, IFRS 2, Hypothèses, Départs, Versions, Attributions).
 *
 * Le Synthesis tab a été refondu Étape 13 (EditorialSynthesisTab).
 * Les 7 autres onglets gardent leur skin legacy V1 — ce sandbox sert
 * à confirmer qu'ils tiennent visuellement avec les nouveaux tokens
 * (text-muted-foreground → ink-500, bg-card → paper-50, border-border
 * → paper-300 via @theme inline).
 *
 * Cliquer sur les onglets en haut pour switcher.
 */

const FIXTURE_PLAN_DETAIL: PlanDetail = {
  plan: {
    id: 'plan-1',
    name: 'BSPCE-2026-001 · Tranche A',
    description: 'Plan de fidélisation lancé pour les talents Q1 2026.',
    plan_type: 'BSPCE',
    settlement_type: 'EQUITY',
    status: 'ACTIVE',
    version: 1,
    is_locked: false,
    pool_size: 50000,
    pool_allocated: 32400,
    pool_vested: 8200,
    pool_exercised: 0,
    pool_cancelled: 0,
    exercise_price: 24,
    reference_share_price: 312,
    board_date: '2026-01-15',
    grant_date: '2026-01-15',
    shareholder_meeting_date: '2025-12-15',
    shareholder_authorization_expires_at: '2027-12-15',
    performance_combination_type: 'AND',
    performance_evaluation_moment: 'END',
    performance_failure_action: 'FORFEIT',
    parent_plan_id: null,
    compliance_warnings: [],
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    created_by: null,
  },
  company: { id: 'c1', name: 'Paragraphe SAS', country_code: 'FR', ticker: null },
  vestingSchedule: {
    id: 'sched-1',
    vesting_type: 'CLIFF_LINEAR',
    cliff_months: 12,
    cliff_percentage: 25,
    total_months: 48,
    frequency: 'YEARLY',
    linear_after_cliff: true,
    single_vesting_date: null,
    tranches: [
      { id: 't1', sort_order: 0, vesting_date: '2027-01-15', percentage_of_award: 25 },
      { id: 't2', sort_order: 1, vesting_date: '2028-01-15', percentage_of_award: 25 },
      { id: 't3', sort_order: 2, vesting_date: '2029-01-15', percentage_of_award: 25 },
      { id: 't4', sort_order: 3, vesting_date: '2030-01-15', percentage_of_award: 25 },
    ],
  },
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
  leavers: [
    {
      id: 'l1',
      leaver_type: 'resignation',
      treatment: 'forfeit_all',
      acceleration_months: null,
      exercise_window_days: null,
    },
    {
      id: 'l2',
      leaver_type: 'mutual_agreement',
      treatment: 'pro_rata',
      acceleration_months: null,
      exercise_window_days: 90,
    },
    {
      id: 'l3',
      leaver_type: 'company_sale',
      treatment: 'full_accelerate',
      acceleration_months: null,
      exercise_window_days: 365,
    },
  ],
  hypothesisSets: [],
  valuationRuns: [],
  latestValuation: null,
  latestIfrs2: null,
  versions: [],
};

export default function PlanTabsPreviewPage() {
  return (
    <div className="bg-paper-100 min-h-screen">
      <header className="border-paper-300 border-b px-6 py-4">
        <Link
          href="/dev/design"
          className="text-ink-500 hover:text-ink-900 inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          /dev/design
        </Link>
        <p className="text-overline text-brass-500 mt-3">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          Plan Detail tabs{' '}
          <span className="serif-italic text-brass-500">7 onglets non refondus</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-3xl text-sm leading-relaxed">
          Le Synthesis tab a été refondu Étape 13. Les 7 autres onglets (État, Performance, IFRS 2,
          Hypothèses, Départs, Versions, Attributions) gardent leur skin legacy V1 — cliquez sur
          chaque tab pour vérifier qu&apos;ils tiennent visuellement avec les nouveaux tokens via
          mapping <code className="bg-paper-200 rounded px-1 font-mono">@theme inline</code>{' '}
          (text-muted-foreground → ink-500, bg-card → paper-50, border-border → paper-300).
        </p>
      </header>

      <div className="mx-auto max-w-6xl p-6 sm:p-8">
        <PlanDetailClient detail={FIXTURE_PLAN_DETAIL} canUpdate={true} planAwards={[]} />
      </div>
    </div>
  );
}
