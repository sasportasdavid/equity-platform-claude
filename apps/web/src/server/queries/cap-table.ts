import 'server-only';

/**
 * Module 10 B3 — Queries cap-table (read-only).
 *
 * `getCapTable` — wrapper Server Component / Server Action friendly autour
 * du RPC `compute_cap_table` (B1, migration 00085). 3 view modes :
 *   - CONSOLIDATED : positions actives uniquement
 *   - DILUTED      : + awards GRANTED virtuels (ESOP_VIRTUAL)
 *   - PRO_FORMA    : DILUTED + scénario appliqué (apply_scenario helper)
 *
 * Pattern Result `{ ok, data | error }` pour caller flexibility.
 *
 * Note : pas une Server Action `'use server'` car :
 *   1. Lecture pure, pas d'audit événement
 *   2. Utilisé en Server Component direct (page /dashboard/captable/page.tsx)
 *   3. Pattern Module 4-9 = `server/queries/*` pour les reads
 */

import { getCapTableInputSchema, type GetCapTableInput, type ViewMode } from '@equity/shared';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Position résolue par compute_cap_table — shape JSON. Type cohérent avec
 * `00085_module_10_compute_cap_table_rpc.sql:115-129` jsonb_build_object.
 */
export type CapTablePosition = {
  /** UUID si vraie position, undefined si virtuelle (ESOP_VIRTUAL ou SCENARIO_*). */
  id?: string;
  stakeholder_type: string;
  stakeholder_id: string | null;
  stakeholder_name: string;
  stakeholder_email?: string | null;
  share_class_id?: string;
  share_class_code: string;
  share_class_type: string;
  units: number;
  cost_basis_total?: number | null;
  source: string;
  source_id?: string | null;
  acquired_at: string;
};

export type CapTableResult = {
  org_id: string;
  asof_date: string;
  view_mode: ViewMode;
  scenario_id: string | null;
  positions: CapTablePosition[];
  totals_by_class: Record<string, number>;
  grand_total_units: number;
  computed_at: string;
};

type QueryOk<T> = { ok: true; data: T };
type QueryError = { ok: false; error: string };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lit la cap table consolidée d'une org via le RPC `compute_cap_table`.
 *
 * Permission : `captable.read.all`. Si l'utilisateur ne l'a pas,
 * `requirePermission` throw une 403. Le RPC SECURITY DEFINER refait son
 * propre check côté DB (defense in depth).
 *
 * Inputs vides → defaults : asofDate = today, viewMode = CONSOLIDATED,
 * scenarioId = null.
 */
export async function getCapTable(
  input: GetCapTableInput = {},
): Promise<QueryOk<CapTableResult> | QueryError> {
  const parsed = getCapTableInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Input invalide',
    };
  }
  const data = parsed.data;

  const user = await requirePermission('captable.read.all');
  if (!user.activeOrgId) {
    return { ok: false, error: 'Organisation active manquante' };
  }

  const supabase = await createSupabaseServerClient();

  const { data: rpcResult, error } = await supabase.rpc('compute_cap_table', {
    p_org_id: user.activeOrgId,
    p_asof_date: data.asofDate ?? new Date().toISOString().slice(0, 10),
    p_scenario_id: data.scenarioId ?? undefined,
    p_view_mode: data.viewMode,
  });

  if (error) {
    return { ok: false, error: `compute_cap_table failed: ${error.message}` };
  }
  if (!rpcResult || typeof rpcResult !== 'object') {
    return { ok: false, error: 'compute_cap_table: réponse vide' };
  }

  return { ok: true, data: rpcResult as unknown as CapTableResult };
}
