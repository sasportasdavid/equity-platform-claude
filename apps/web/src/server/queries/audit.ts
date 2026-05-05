import 'server-only';
import { unstable_cache } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * PR #39 B3 — Server queries pour la page /audit-trail.
 *
 * Utilise `createSupabaseServerClient()` (cookie-based) pour que la RLS
 * `audit_events_select` (org_id = current_org_id() AND has_permission(
 * 'audit.read')) s'applique automatiquement. **Pas** d'admin client
 * (sinon bypass RLS = leak inter-org).
 *
 * `getAuditStats()` est cached `unstable_cache` 60s (les stats globales
 * de l'org changent rarement à cette résolution, et la page audit n'est
 * pas un workflow critique temps réel).
 *
 * `getAuditEvents()` n'est PAS cached (les filtres + pagination varient
 * trop pour un cache utile en V1).
 */

export type AuditEventRow = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export type AuditEventsParams = {
  /** ISO date `YYYY-MM-DDTHH:mm:ss.000Z` ou `YYYY-MM-DD`. */
  from?: string | undefined;
  to?: string | undefined;
  /** Préfixe family (ex `plan` matche `plan.created`, `plan.locked`). `'all'` ou absent → tous. */
  eventTypePrefix?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

export type AuditEventsResult = {
  items: AuditEventRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 50;

export async function getAuditEvents(params: AuditEventsParams = {}): Promise<AuditEventsResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('audit_events')
    .select(
      'id, org_id, user_id, user_email, event_type, resource_type, resource_id, metadata, occurred_at',
      { count: 'exact' },
    )
    .order('occurred_at', { ascending: false });

  if (params.from) query = query.gte('occurred_at', params.from);
  if (params.to) query = query.lte('occurred_at', params.to);
  if (params.eventTypePrefix && params.eventTypePrefix !== 'all') {
    query = query.like('event_type', `${params.eventTypePrefix}.%`);
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error) {
    // RLS denial = pas de droits ; renvoyer un résultat vide propre plutôt
    // que throw (la page rend un empty state éditorial).
    return { items: [], page, pageSize, total: 0, totalPages: 0 };
  }

  const items: AuditEventRow[] = (data ?? []).map((row) => ({
    id: row.id,
    org_id: row.org_id,
    user_id: row.user_id,
    user_email: row.user_email,
    event_type: row.event_type,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    occurred_at: row.occurred_at,
  }));

  const total = count ?? 0;
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type AuditStats = {
  totalEvents: number;
  daysCovered: number;
  distinctTypes: number;
  distinctActors: number;
};

/**
 * Stats agrégées pour le hero. Cache 60s (clé scope par session caller
 * via cookie — `unstable_cache` cohabite avec `createSupabaseServerClient`
 * en RSC car la RLS est appliquée à chaque query, pas au cache).
 *
 * V1.5 : raffiner le cache en par-org explicite (clé `org:${orgId}:audit-stats`).
 */
export async function getAuditStats(): Promise<AuditStats> {
  return unstable_cache(
    async () => {
      const supabase = await createSupabaseServerClient();

      const [{ count: totalEvents }, typesRes, actorsRes, oldestRes] = await Promise.all([
        supabase.from('audit_events').select('id', { count: 'exact', head: true }),
        supabase.from('audit_events').select('event_type'),
        supabase.from('audit_events').select('user_id'),
        supabase
          .from('audit_events')
          .select('occurred_at')
          .order('occurred_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      const distinctTypes = new Set((typesRes.data ?? []).map((r) => r.event_type).filter(Boolean))
        .size;
      const distinctActors = new Set(
        (actorsRes.data ?? []).map((r) => r.user_id).filter((id): id is string => Boolean(id)),
      ).size;

      const oldestIso = oldestRes.data?.occurred_at;
      const daysCovered = oldestIso
        ? Math.max(1, Math.ceil((Date.now() - Date.parse(oldestIso)) / 86_400_000))
        : 0;

      return {
        totalEvents: totalEvents ?? 0,
        daysCovered,
        distinctTypes,
        distinctActors,
      };
    },
    ['audit-stats'],
    { tags: ['audit-stats'], revalidate: 60 },
  )();
}
