import 'server-only';
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
