import 'server-only';
import { unstable_cache } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * PR #36 B2 — Date de la prochaine échéance de vesting pour l'org.
 *
 * Query : MIN(scheduled_date) FROM vesting_events WHERE org_id = $1 AND
 * status = 'PENDING' AND scheduled_date > now().
 *
 * Filtré par org via la jointure `awards.org_id` (vesting_events n'a pas
 * de colonne org_id directe — passe par `award_id → awards.org_id`).
 *
 * Wrappé dans `unstable_cache` 5 minutes (la prochaine échéance change
 * rarement minute à minute, et le rendu hero est non critique).
 *
 * Tag `org:${orgId}:vesting` pour invalidation V2 (création/cancel award).
 */

const REVALIDATE_SECONDS = 300;

async function fetchNextVestingDate(orgId: string): Promise<Date | null> {
  const admin = getSupabaseAdminClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  // Étape 1 : lister les award_ids de l'org (RLS bypass via admin client).
  const { data: awards } = await admin.from('awards').select('id').eq('org_id', orgId);
  const awardIds = (awards ?? []).map((a) => a.id);
  if (awardIds.length === 0) return null;

  // Étape 2 : MIN(scheduled_date) parmi les vesting_events PENDING futurs.
  const { data: events } = await admin
    .from('vesting_events')
    .select('scheduled_date')
    .in('award_id', awardIds)
    .eq('status', 'PENDING')
    .gt('scheduled_date', todayIso)
    .order('scheduled_date', { ascending: true })
    .limit(1);

  const next = events?.[0]?.scheduled_date;
  if (!next) return null;
  return new Date(next);
}

export async function getOrgNextVestingDate(orgId: string): Promise<Date | null> {
  const cached = unstable_cache(() => fetchNextVestingDate(orgId), ['next-vesting-date', orgId], {
    tags: [`org:${orgId}:vesting`],
    revalidate: REVALIDATE_SECONDS,
  });
  const result = await cached();
  // unstable_cache serialise les Date en string — re-instancier proprement.
  if (result === null) return null;
  return result instanceof Date ? result : new Date(result as unknown as string);
}
