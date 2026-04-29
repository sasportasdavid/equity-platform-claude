import 'server-only';
import type { Json } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 4 B3 — Server queries pour les bénéficiaires.
 *
 * Toutes les queries passent par `createSupabaseServerClient` (cookies user)
 * → soumises aux RLS Pattern 1 (org_id + permission). Le user ne voit que
 * les bénéficiaires de son org active.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListBeneficiariesFilters = {
  search?: string;
  statuses?: ('active' | 'on_leave' | 'terminated')[];
  types?: string[]; // EMPLOYEE / OFFICER / CONSULTANT / ADVISOR / OTHER
  contractTypes?: string[]; // CDI / CDD / ...
  hasAwards?: 'with' | 'without';
  taxResidentFrance?: 'yes' | 'no';
  hireDateFrom?: string; // YYYY-MM-DD
  hireDateTo?: string;
  includeArchived?: boolean;
};

export type BeneficiaryListRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  beneficiary_type: string;
  contract_type: string | null;
  job_title: string | null;
  department: string | null;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
  is_tax_resident_france: boolean | null;
  tax_residence_country: string;
  invited_at: string | null;
  invitation_count: number | null;
  first_login_at: string | null;
  user_id: string | null;
  created_at: string;
  /** Computed : count des awards non-terminés. */
  awards_count: number;
};

// ---------------------------------------------------------------------------
// listBeneficiaries
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<string, number> = { active: 0, on_leave: 1, terminated: 2 };

export async function listBeneficiaries(
  filters: ListBeneficiariesFilters = {},
): Promise<BeneficiaryListRow[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('beneficiaries')
    .select(
      `id, email, first_name, last_name, preferred_name,
       beneficiary_type, contract_type, job_title, department,
       status, hire_date, termination_date,
       is_tax_resident_france, tax_residence_country,
       invited_at, invitation_count, first_login_at, user_id, created_at`,
    )
    .limit(200);

  if (!filters.includeArchived) {
    query = query.is('deleted_at', null);
  }

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }

  if (filters.types && filters.types.length > 0) {
    query = query.in('beneficiary_type', filters.types);
  }

  if (filters.contractTypes && filters.contractTypes.length > 0) {
    query = query.in('contract_type', filters.contractTypes);
  }

  if (filters.taxResidentFrance === 'yes') {
    query = query.eq('is_tax_resident_france', true);
  } else if (filters.taxResidentFrance === 'no') {
    query = query.eq('is_tax_resident_france', false);
  }

  if (filters.hireDateFrom) query = query.gte('hire_date', filters.hireDateFrom);
  if (filters.hireDateTo) query = query.lte('hire_date', filters.hireDateTo);

  // Search : full_name (= first || last) + email + job_title
  // Postgres `or` syntax via Supabase JS — ilike sur chaque champ
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim().replace(/[%_]/g, (c) => `\\${c}`)}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},job_title.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`listBeneficiaries failed: ${error.message}`);
  }
  const rows = (data ?? []) as Omit<BeneficiaryListRow, 'awards_count'>[];

  // Counts d'awards non-terminés en parallèle (1 query par bene en V1 ;
  // V2 = single SQL aggregate via une view ou RPC dédié si > 200 benes).
  const ids = rows.map((r) => r.id);
  let awardsCounts: Map<string, number> = new Map();
  if (ids.length > 0) {
    const { data: awardRows } = await supabase
      .from('awards')
      .select('beneficiary_id')
      .in('beneficiary_id', ids)
      .not('status', 'in', '(CANCELLED,FORFEITED,EXPIRED,FULLY_EXERCISED)')
      .is('deleted_at', null);
    awardsCounts = new Map();
    for (const r of awardRows ?? []) {
      awardsCounts.set(r.beneficiary_id, (awardsCounts.get(r.beneficiary_id) ?? 0) + 1);
    }
  }

  let withCounts: BeneficiaryListRow[] = rows.map((r) => ({
    ...r,
    awards_count: awardsCounts.get(r.id) ?? 0,
  }));

  // Filtre hasAwards en post-fetch (la sub-query SQL avec count serait plus
  // élégante mais Supabase JS ne le supporte pas trivialement)
  if (filters.hasAwards === 'with') {
    withCounts = withCounts.filter((r) => r.awards_count > 0);
  } else if (filters.hasAwards === 'without') {
    withCounts = withCounts.filter((r) => r.awards_count === 0);
  }

  // Sort : status (active first) puis full_name
  withCounts.sort((a, b) => {
    const da = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    if (da !== 0) return da;
    const an = `${a.first_name} ${a.last_name}`.toLowerCase();
    const bn = `${b.first_name} ${b.last_name}`.toLowerCase();
    return an.localeCompare(bn);
  });

  return withCounts;
}

// ---------------------------------------------------------------------------
// getBeneficiaryDetail — Module 4 B4
// ---------------------------------------------------------------------------

export type BeneficiaryAwardSummary = {
  id: string;
  award_number: string | null;
  status: string;
  units_granted: number;
  units_vested: number | null;
  units_outstanding: number | null;
  exercise_price: number | null;
  grant_date: string;
  vesting_start_date: string | null;
  plan: { id: string; name: string; plan_type: string } | null;
};

export type BeneficiaryDetailRow = {
  beneficiary: {
    id: string;
    org_id: string;
    user_id: string | null;
    email: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    gender: string | null;
    phone_encrypted: string | null;
    beneficiary_type: string;
    contract_type: string | null;
    job_title: string | null;
    department: string | null;
    manager_id: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    tax_residence_country: string;
    is_tax_resident_france: boolean | null;
    tax_id: string | null;
    hire_date: string | null;
    termination_date: string | null;
    status: string;
    lifecycle_changed_at: string | null;
    lifecycle_change_reason: string | null;
    invited_at: string | null;
    invitation_count: number | null;
    first_login_at: string | null;
    bic: string | null;
    bank_name: string | null;
    bank_account_holder_name: string | null;
    /** Masqué : FRXX **** **** **XX (4 premiers + 2 derniers, jamais le full). */
    iban_masked: string | null;
    custom_fields: Json;
    created_at: string;
    updated_at: string;
  };
  manager: { id: string; first_name: string; last_name: string; email: string } | null;
  directReports: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    status: string;
  }>;
  awards: BeneficiaryAwardSummary[];
  stats: {
    activeAwardsCount: number;
    totalAwardsCount: number;
    totalUnitsGranted: number;
    totalUnitsVested: number;
    totalUnitsExercised: number;
    totalUnitsOutstanding: number;
    firstGrantDate: string | null;
    latestGrantDate: string | null;
  };
  auditEvents: Array<{
    id: string;
    event_type: string;
    metadata: Json;
    user_email: string | null;
    user_id: string | null;
    occurred_at: string;
  }>;
};

const AWARD_SORT_ORDER: Record<string, number> = {
  GRANTED: 0,
  VESTING: 0,
  PARTIALLY_VESTED: 0,
  FULLY_VESTED: 0,
  PARTIALLY_EXERCISED: 0,
  PENDING_APPROVAL: 1,
  APPROVED: 1,
  PENDING_BOARD: 1,
  BOARD_APPROVED: 1,
  PENDING_SIGNATURE: 1,
  PROPOSED: 1,
  DRAFT: 2,
  FULLY_EXERCISED: 3,
  CANCELLED: 4,
  FORFEITED: 4,
  EXPIRED: 4,
};

function maskIban(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.length < 6) return cleaned;
  const first = cleaned.slice(0, 4);
  const last = cleaned.slice(-2);
  const stars = '*'.repeat(Math.max(0, cleaned.length - 6));
  // Format affichage : groupes de 4
  const masked = (first + stars + last).replace(/(.{4})/g, '$1 ').trim();
  return masked;
}

/**
 * Server Query getBeneficiaryDetail — Module 4 B4.
 *
 * 6 queries en parallèle (Promise.all) :
 *   1. beneficiary row complet
 *   2. manager (si manager_id) — fait après step 1 (chain)
 *   3. directReports (où manager_id = bene.id)
 *   4. awards de ce bénéficiaire (avec join plan)
 *   5. audit_events (resource_id = bene.id)
 *   6. (futur Module 8 : auth.users.last_sign_in_at — V1 dérivé de first_login_at)
 *
 * Le manager dépend du beneficiary, donc 2 vagues parallèles. Les autres
 * queries sont indépendantes.
 *
 * Returns null si bénéficiaire introuvable ou soft-deleted (le caller
 * appellera notFound()).
 *
 * IBAN MASKED dans le payload — never expose full IBAN to admin (V1).
 */
export async function getBeneficiaryDetail(
  beneficiaryId: string,
): Promise<BeneficiaryDetailRow | null> {
  const supabase = await createSupabaseServerClient();

  const beneRes = await supabase
    .from('beneficiaries')
    .select('*')
    .eq('id', beneficiaryId)
    .is('deleted_at', null)
    .maybeSingle();
  if (beneRes.error || !beneRes.data) return null;

  const bene = beneRes.data as unknown as BeneficiaryDetailRow['beneficiary'] & {
    iban?: string | null;
  };

  // Wave 2 — parallèles (4 queries) : manager + directReports + awards + audit
  const [managerRes, reportsRes, awardsRes, auditRes] = await Promise.all([
    bene.manager_id
      ? supabase
          .from('beneficiaries')
          .select('id, first_name, last_name, email')
          .eq('id', bene.manager_id)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    supabase
      .from('beneficiaries')
      .select('id, first_name, last_name, email, status')
      .eq('manager_id', beneficiaryId)
      .is('deleted_at', null)
      .order('first_name'),
    supabase
      .from('awards')
      .select(
        `id, award_number, status, units_granted, units_vested, units_outstanding,
         exercise_price, grant_date, vesting_start_date,
         plan:plans!awards_plan_id_fkey ( id, name, plan_type )`,
      )
      .eq('beneficiary_id', beneficiaryId)
      .is('deleted_at', null)
      .order('grant_date', { ascending: false })
      .limit(100),
    supabase
      .from('audit_events')
      .select('id, event_type, metadata, user_email, user_id, occurred_at')
      .eq('resource_id', beneficiaryId)
      .order('occurred_at', { ascending: false })
      .limit(50),
  ]);

  // Awards stats
  const awards = (awardsRes.data ?? []) as BeneficiaryAwardSummary[];
  const activeAwards = awards.filter(
    (a) => !['CANCELLED', 'FORFEITED', 'EXPIRED', 'FULLY_EXERCISED'].includes(a.status),
  );
  const totalUnitsGranted = awards.reduce((s, a) => s + Number(a.units_granted ?? 0), 0);
  const totalUnitsVested = awards.reduce((s, a) => s + Number(a.units_vested ?? 0), 0);
  // units_exercised pas dans le SELECT minimal — on lit via units_outstanding et units_granted
  const totalUnitsOutstanding = awards.reduce((s, a) => s + Number(a.units_outstanding ?? 0), 0);
  const totalUnitsExercised = totalUnitsGranted - totalUnitsOutstanding - totalUnitsVested;
  const firstGrant = awards.length > 0 ? (awards[awards.length - 1]?.grant_date ?? null) : null;
  const latestGrant = awards.length > 0 ? (awards[0]?.grant_date ?? null) : null;

  // Sort awards : actifs first puis by grant_date desc (déjà sort SQL pour grant_date)
  awards.sort((a, b) => (AWARD_SORT_ORDER[a.status] ?? 9) - (AWARD_SORT_ORDER[b.status] ?? 9));

  return {
    beneficiary: {
      ...bene,
      iban_masked: maskIban(bene.iban),
    },
    manager: managerRes.data ?? null,
    directReports: (reportsRes.data ?? []) as BeneficiaryDetailRow['directReports'],
    awards,
    stats: {
      activeAwardsCount: activeAwards.length,
      totalAwardsCount: awards.length,
      totalUnitsGranted,
      totalUnitsVested,
      totalUnitsExercised: Math.max(0, totalUnitsExercised),
      totalUnitsOutstanding,
      firstGrantDate: firstGrant,
      latestGrantDate: latestGrant,
    },
    auditEvents: (auditRes.data ?? []) as BeneficiaryDetailRow['auditEvents'],
  };
}
