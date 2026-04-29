import 'server-only';
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
