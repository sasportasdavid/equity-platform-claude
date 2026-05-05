import 'server-only';
import { unstable_cache } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * PR #35 B2 — Counters de navigation pour la sidebar dashboard.
 *
 * 3 counts SELECT count exact, head:true (1 round trip Postgres chacun).
 * Wrappés dans `unstable_cache` Next.js 16 avec :
 * - clé `sidebar-counts:${orgId}`
 * - tag `org:{orgId}:counts` (utile pour invalidation V2 via revalidateTag)
 * - revalidate 60s (cf brief PR #35 §C — tolérance freshness)
 *
 * Le client est l'admin (service_role) car `unstable_cache` ne capture pas
 * le request scope (cookies indisponibles dans le callback). On filtre
 * explicitement par org_id pour préserver l'isolation.
 *
 * Invalidation V2 (out of scope V1, cf brief) : `revalidateTag(`org:${orgId}:counts`)`
 * dans createPlan / inviteBeneficiary / createAward.
 */

export type SidebarCounts = {
  plans: number;
  beneficiaries: number;
  awards: number;
};

const REVALIDATE_SECONDS = 60;

/**
 * Statuts d'awards considérés comme "actifs" pour le counter sidebar.
 * On exclut les terminaux (CANCELLED/FORFEITED/EXPIRED) ainsi que les
 * brouillons (DRAFT) pour rester cohérent avec ce que l'utilisateur attend
 * voir dans "Attributions" — le mockup montre 8 attributions actives.
 *
 * Le filtre `deleted_at IS NULL` est aussi appliqué (soft-delete).
 */
const ACTIVE_AWARD_STATUSES = [
  'PROPOSED',
  'PENDING_APPROVAL',
  'APPROVED',
  'GRANTED',
  'ACCEPTED',
  'VESTING_IN_PROGRESS',
  'VESTED',
  'EXERCISED',
] as const;

async function fetchSidebarCounts(orgId: string): Promise<SidebarCounts> {
  const admin = getSupabaseAdminClient();

  const [plansRes, beneficiariesRes, awardsRes] = await Promise.all([
    admin
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('deleted_at', null),
    admin
      .from('beneficiaries')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
    admin
      .from('awards')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('status', ACTIVE_AWARD_STATUSES as unknown as string[]),
  ]);

  return {
    plans: plansRes.count ?? 0,
    beneficiaries: beneficiariesRes.count ?? 0,
    awards: awardsRes.count ?? 0,
  };
}

/**
 * Wrapper avec cache 60s par org. Tag `org:${orgId}:counts` pour
 * invalidation future (V2).
 */
export async function getSidebarCounts(orgId: string): Promise<SidebarCounts> {
  const cached = unstable_cache(() => fetchSidebarCounts(orgId), ['sidebar-counts', orgId], {
    tags: [`org:${orgId}:counts`],
    revalidate: REVALIDATE_SECONDS,
  });
  return cached();
}
