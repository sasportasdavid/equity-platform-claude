import 'server-only';
import type { Json } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 3b B3 — Server queries pour les awards.
 *
 * Toutes les queries utilisent `createSupabaseServerClient` (cookies user)
 * → soumis aux RLS Pattern 1 (org_id + permission). Donc le user ne voit
 * que les awards de son org active.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListAwardsFilters = {
  search?: string;
  status?: string[];
  planId?: string;
  beneficiaryType?: string;
};

export type AwardListRow = {
  id: string;
  award_number: string | null;
  status: string;
  units_granted: number;
  units_vested: number | null;
  exercise_price: number | null;
  grant_date: string;
  vesting_start_date: string | null;
  created_at: string;
  plan: { id: string; name: string; plan_type: string; is_locked: boolean } | null;
  beneficiary: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    beneficiary_type: string;
  } | null;
};

export type PlanForCreation = {
  id: string;
  name: string;
  plan_type: string;
  pool_size: number;
  pool_allocated: number;
  pool_remaining: number;
  exercise_price: number | null;
  status: string;
};

export type BeneficiarySearchRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  beneficiary_type: string;
};

export type PoolStatus = {
  poolSize: number;
  allocated: number;
  remaining: number;
};

// ---------------------------------------------------------------------------
// listAwards — page liste /dashboard/awards
// ---------------------------------------------------------------------------

export async function listAwards(filters: ListAwardsFilters = {}): Promise<AwardListRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('awards')
    .select(
      `id, award_number, status, units_granted, units_vested, exercise_price, grant_date,
       vesting_start_date, created_at,
       plan:plans!awards_plan_id_fkey ( id, name, plan_type, is_locked ),
       beneficiary:beneficiaries!awards_beneficiary_id_fkey ( id, first_name, last_name, email, beneficiary_type )`,
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }
  if (filters.planId) {
    query = query.eq('plan_id', filters.planId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let rows = data.map((r) => ({
    id: r.id,
    award_number: r.award_number,
    status: r.status,
    units_granted: Number(r.units_granted),
    units_vested: r.units_vested != null ? Number(r.units_vested) : null,
    exercise_price: r.exercise_price != null ? Number(r.exercise_price) : null,
    grant_date: r.grant_date,
    vesting_start_date: r.vesting_start_date,
    created_at: r.created_at,
    plan: r.plan,
    beneficiary: r.beneficiary,
  }));

  // Filtres post-query (Supabase JS ne facilite pas les filters joints)
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter((r) => {
      const name =
        `${r.beneficiary?.first_name ?? ''} ${r.beneficiary?.last_name ?? ''}`.toLowerCase();
      const email = r.beneficiary?.email?.toLowerCase() ?? '';
      const num = r.award_number?.toLowerCase() ?? '';
      return name.includes(q) || email.includes(q) || num.includes(q);
    });
  }
  if (filters.beneficiaryType) {
    rows = rows.filter((r) => r.beneficiary?.beneficiary_type === filters.beneficiaryType);
  }

  return rows as AwardListRow[];
}

// ---------------------------------------------------------------------------
// listPlansForAwardCreation — select de la modale
// ---------------------------------------------------------------------------

export async function listPlansForAwardCreation(): Promise<PlanForCreation[]> {
  const supabase = await createSupabaseServerClient();
  // status ∈ {ACTIVE} suffit en V1 ; LOCKED n'existe pas dans plans.status
  // (les plans verrouillés gardent leur status fonctionnel + flag is_locked=true).
  // On accepte donc tous les plans non-archivés sauf CLOSED/CANCELLED.
  const { data: plans } = await supabase
    .from('plans')
    .select('id, name, plan_type, pool_size, pool_allocated, exercise_price, status, is_locked')
    .is('deleted_at', null)
    .in('status', ['DRAFT', 'ACTIVE'])
    .order('name', { ascending: true });

  if (!plans) return [];

  // Recalcul allocated précis : SUM(units_granted) hors DRAFT/CANCELLED/FORFEITED
  // (la colonne plans.pool_allocated peut être stale ou compter différemment).
  const planIds = plans.map((p) => p.id);
  const { data: allocs } = await supabase
    .from('awards')
    .select('plan_id, units_granted, status')
    .in('plan_id', planIds)
    .not('status', 'in', '(CANCELLED,FORFEITED,DRAFT)')
    .is('deleted_at', null);

  const allocByPlan = new Map<string, number>();
  for (const a of allocs ?? []) {
    if (!a.plan_id) continue;
    allocByPlan.set(a.plan_id, (allocByPlan.get(a.plan_id) ?? 0) + Number(a.units_granted));
  }

  return plans.map((p) => {
    const allocated = allocByPlan.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      plan_type: p.plan_type,
      pool_size: Number(p.pool_size),
      pool_allocated: allocated,
      pool_remaining: Math.max(0, Number(p.pool_size) - allocated),
      exercise_price: p.exercise_price != null ? Number(p.exercise_price) : null,
      status: p.status,
    };
  });
}

// ---------------------------------------------------------------------------
// searchBeneficiaries — autocomplete du combobox modale
// ---------------------------------------------------------------------------

export async function searchBeneficiaries(query: string): Promise<BeneficiarySearchRow[]> {
  if (!query || query.trim().length < 2) return [];
  const supabase = await createSupabaseServerClient();
  const safe = query.trim().replace(/[%_]/g, '');

  const { data, error } = await supabase
    .from('beneficiaries')
    .select('id, first_name, last_name, email, beneficiary_type')
    .is('deleted_at', null)
    .or(`email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
    .limit(10);

  if (error || !data) return [];
  return data as BeneficiarySearchRow[];
}

// ---------------------------------------------------------------------------
// getPoolStatus — banner pool dans la modale
// ---------------------------------------------------------------------------

export async function getPoolStatus(planId: string): Promise<PoolStatus | null> {
  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from('plans')
    .select('pool_size')
    .eq('id', planId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!plan) return null;

  const { data: allocs } = await supabase
    .from('awards')
    .select('units_granted')
    .eq('plan_id', planId)
    .not('status', 'in', '(CANCELLED,FORFEITED,DRAFT)')
    .is('deleted_at', null);

  const allocated = (allocs ?? []).reduce((s, r) => s + Number(r.units_granted), 0);
  const poolSize = Number(plan.pool_size);
  return {
    poolSize,
    allocated,
    remaining: Math.max(0, poolSize - allocated),
  };
}

// ---------------------------------------------------------------------------
// getAwardDetail — page détail /dashboard/awards/[id] — Module 3b B4
// ---------------------------------------------------------------------------

export type AwardDetailRow = {
  award: {
    id: string;
    award_number: string | null;
    status: string;
    units_granted: number;
    units_vested: number;
    units_exercised: number;
    units_settled: number;
    units_cancelled: number;
    units_outstanding: number | null;
    exercise_price: number | null;
    fair_value_per_unit: number | null;
    total_fair_value: number | null;
    grant_date: string;
    vesting_start_date: string | null;
    expiry_date: string | null;
    acceptance_deadline: string | null;
    accepted_at: string | null;
    granted_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    plan_version: number | null;
    has_modifications: boolean | null;
    is_compliant: boolean | null;
    compliance_warnings: Json;
    vesting_schedule_snapshot: Json;
    performance_conditions_snapshot: Json;
    leaver_rules_snapshot: Json;
    created_at: string;
    updated_at: string;
  };
  plan: {
    id: string;
    name: string;
    plan_type: string;
    is_locked: boolean;
    version: number;
    parent_plan_id: string | null;
  } | null;
  beneficiary: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    beneficiary_type: string;
    tax_residence_country: string | null;
    hire_date: string | null;
  } | null;
  vestingEvents: Array<{
    id: string;
    tranche_id: string | null;
    scheduled_date: string;
    effective_date: string | null;
    units_to_vest: number;
    units_vested: number;
    performance_multiplier: number | null;
    status: string;
    notification_sent_at: string | null;
  }>;
  modifications: Array<{
    id: string;
    modification_type: string;
    effective_date: string;
    incremental_fair_value: number | null;
    approved_by: string | null;
    approved_at: string | null;
    reason: string | null;
    before_snapshot: Json;
    after_snapshot: Json;
    created_at: string;
  }>;
  auditEvents: Array<{
    id: string;
    event_type: string;
    metadata: Json;
    user_email: string | null;
    user_id: string | null;
    occurred_at: string;
  }>;
  stats: {
    totalGranted: number;
    totalVested: number;
    totalExercised: number;
    totalCancelled: number;
    totalOutstanding: number;
    vestingProgress: number;
  };
};

/**
 * Charge tout le contexte nécessaire à la page détail d'un award en
 * 6 queries parallèles (award + plan + beneficiary + vestingEvents +
 * modifications + audit).
 *
 * Retourne null si l'award n'existe pas, est soft-deleted ou n'est pas
 * accessible (RLS Pattern 1 filtre à l'org active).
 */
export async function getAwardDetail(awardId: string): Promise<AwardDetailRow | null> {
  const supabase = await createSupabaseServerClient();

  // 1. Charger l'award (RLS filtre par org_id)
  const { data: award, error } = await supabase
    .from('awards')
    .select('*')
    .eq('id', awardId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !award) return null;

  // 5 queries parallèles pour les données dépendantes
  const [planRes, beneficiaryRes, vestingRes, modsRes, auditRes] = await Promise.all([
    award.plan_id
      ? supabase
          .from('plans')
          .select('id, name, plan_type, is_locked, version, parent_plan_id')
          .eq('id', award.plan_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    award.beneficiary_id
      ? supabase
          .from('beneficiaries')
          .select(
            'id, first_name, last_name, email, beneficiary_type, tax_residence_country, hire_date',
          )
          .eq('id', award.beneficiary_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('vesting_events')
      .select(
        'id, tranche_id, scheduled_date, effective_date, units_to_vest, units_vested, performance_multiplier, status, notification_sent_at',
      )
      .eq('award_id', awardId)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('award_modifications')
      .select(
        'id, modification_type, effective_date, incremental_fair_value, approved_by, approved_at, reason, before_snapshot, after_snapshot, created_at',
      )
      .eq('award_id', awardId)
      .order('effective_date', { ascending: false }),
    supabase
      .from('audit_events')
      .select('id, event_type, metadata, user_email, user_id, occurred_at')
      .eq('resource_id', awardId)
      .like('event_type', 'award.%')
      .order('occurred_at', { ascending: false })
      .limit(50),
  ]);

  const vestingEvents = (vestingRes.data ?? []) as AwardDetailRow['vestingEvents'];
  const totalVested = vestingEvents
    .filter((v) => v.status === 'VESTED')
    .reduce((s, v) => s + Number(v.units_vested ?? v.units_to_vest), 0);

  const totalGranted = Number(award.units_granted);
  const totalExercised = Number(award.units_exercised ?? 0);
  const totalCancelled = Number(award.units_cancelled ?? 0);
  const totalOutstanding = Number(
    award.units_outstanding ?? totalGranted - totalExercised - totalCancelled,
  );
  const vestingProgress = totalGranted > 0 ? Math.round((totalVested / totalGranted) * 100) : 0;

  return {
    award: {
      id: award.id,
      award_number: award.award_number,
      status: award.status,
      units_granted: totalGranted,
      units_vested: Number(award.units_vested ?? 0),
      units_exercised: totalExercised,
      units_settled: Number(award.units_settled ?? 0),
      units_cancelled: totalCancelled,
      units_outstanding: award.units_outstanding,
      exercise_price: award.exercise_price != null ? Number(award.exercise_price) : null,
      fair_value_per_unit:
        award.fair_value_per_unit != null ? Number(award.fair_value_per_unit) : null,
      total_fair_value: award.total_fair_value != null ? Number(award.total_fair_value) : null,
      grant_date: award.grant_date,
      vesting_start_date: award.vesting_start_date,
      expiry_date: award.expiry_date,
      acceptance_deadline: award.acceptance_deadline,
      accepted_at: award.accepted_at,
      granted_at: award.granted_at,
      cancelled_at: award.cancelled_at,
      cancellation_reason: award.cancellation_reason,
      plan_version: award.plan_version,
      has_modifications: award.has_modifications,
      is_compliant: award.is_compliant,
      compliance_warnings: award.compliance_warnings,
      vesting_schedule_snapshot: award.vesting_schedule_snapshot,
      performance_conditions_snapshot: award.performance_conditions_snapshot,
      leaver_rules_snapshot: award.leaver_rules_snapshot,
      created_at: award.created_at,
      updated_at: award.updated_at,
    },
    plan: planRes.data ?? null,
    beneficiary: beneficiaryRes.data ?? null,
    vestingEvents,
    modifications: (modsRes.data ?? []) as AwardDetailRow['modifications'],
    auditEvents: (auditRes.data ?? []) as AwardDetailRow['auditEvents'],
    stats: {
      totalGranted,
      totalVested,
      totalExercised,
      totalCancelled,
      totalOutstanding,
      vestingProgress,
    },
  };
}
