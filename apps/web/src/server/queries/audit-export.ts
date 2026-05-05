import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * PR #42 B2 — Queries dédiées aux exports audit (JSON signé / PDF / CSV).
 *
 * Différent de `getAuditEvents` (PR #39) qui paginate à 50/200 max pour la liste UI :
 * - `getAllAuditEventsForExport` : retourne TOUS les events (cap 10 000 V1) avec les
 *   colonnes chain (event_hash, previous_hash, chain_position) pour permettre la
 *   verification offline du hash chain depuis l'export.
 * - `getAuditChainIntegrity` : appelle la RPC `verify_audit_chain_integrity` côté
 *   DB pour produire le bloc `integrity` du JSON export (re-vérifiable côté client
 *   via le hash chain genesis + payload canonical).
 *
 * Sécurité : `createSupabaseServerClient()` (cookie-based JWT) → RLS
 * `audit_events_select` s'applique automatiquement (org_id + has_permission(audit.read)).
 */

/** Cap V1 : 10 000 events max par export (cf brief §"Pièges connus" #5). */
export const AUDIT_EXPORT_MAX_EVENTS = 10_000;

export type AuditEventForExport = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  occurred_at: string;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  /** PR #42 V2 — colonnes hash chain. NULL pour events pré-Module 13 (mark-and-sweep). */
  event_hash: string | null;
  previous_hash: string | null;
  chain_position: number | null;
};

export type AuditExportFilters = {
  /** ISO date YYYY-MM-DDTHH:mm:ss.000Z ou YYYY-MM-DD. */
  from?: string | undefined;
  to?: string | undefined;
  /** Préfixe family (ex `plan`). `'all'` ou absent → tous. */
  eventTypePrefix?: string | undefined;
};

/**
 * Récupère tous les audit_events de l'org active (RLS), filtrés par dates +
 * event_type prefix. Triés par chain_position ASC pour les events chained
 * (genesis premier) puis par occurred_at ASC pour les events pré-Module 13.
 *
 * Cap à 10 000 events V1 (suffit pour CFO en pratique). V1.X : pagination
 * + concat côté serveur ou stream NDJSON pour exports volumineux.
 */
export async function getAllAuditEventsForExport(
  filters: AuditExportFilters = {},
): Promise<AuditEventForExport[]> {
  const supabase = await createSupabaseServerClient();

  // event_hash + previous_hash + chain_position viennent d'être ajoutés en
  // migration 00095 (PR #42 B1) — types DB générés pas encore mis à jour
  // (la regen `pnpm supabase gen types typescript --linked` serait à faire
  // dans une PR de dette technique séparée, hors scope V2). Cast via unknown
  // pour bypass le type-check.
  let query = supabase
    .from('audit_events')
    .select(
      'id, org_id, user_id, user_email, event_type, resource_type, resource_id, metadata, before_state, after_state, occurred_at, ip_address, user_agent, request_id, event_hash, previous_hash, chain_position' as '*',
    )
    .order('chain_position', { ascending: true, nullsFirst: false })
    .order('occurred_at', { ascending: true })
    .limit(AUDIT_EXPORT_MAX_EVENTS);

  if (filters.from) query = query.gte('occurred_at', filters.from);
  if (filters.to) query = query.lte('occurred_at', filters.to);
  if (filters.eventTypePrefix && filters.eventTypePrefix !== 'all') {
    query = query.like('event_type', `${filters.eventTypePrefix}.%`);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    org_id: (row.org_id as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    user_email: (row.user_email as string | null) ?? null,
    event_type: row.event_type as string,
    resource_type: (row.resource_type as string | null) ?? null,
    resource_id: (row.resource_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    before_state: (row.before_state as Record<string, unknown> | null) ?? null,
    after_state: (row.after_state as Record<string, unknown> | null) ?? null,
    occurred_at: row.occurred_at as string,
    ip_address: (row.ip_address as string | null) ?? null,
    user_agent: (row.user_agent as string | null) ?? null,
    request_id: (row.request_id as string | null) ?? null,
    event_hash: (row.event_hash as string | null) ?? null,
    previous_hash: (row.previous_hash as string | null) ?? null,
    chain_position: (row.chain_position as number | null) ?? null,
  }));
}

export type AuditChainIntegrityRow = {
  org_id: string;
  total_events: number;
  verified_events: number;
  broken_at: number | null;
  broken_event_id: string | null;
  is_intact: boolean;
};

/**
 * Appelle la RPC `verify_audit_chain_integrity(p_org_id)` côté DB et retourne
 * le résultat type-safe pour l'org passée. Returns `null` si l'org n'a aucun
 * event chained (e.g. fresh org sans events post-Module 13).
 */
export async function getAuditChainIntegrity(
  orgId: string,
): Promise<AuditChainIntegrityRow | null> {
  const supabase = await createSupabaseServerClient();
  // RPC `verify_audit_chain_integrity` créée en migration 00096 (PR #42 B1) —
  // types DB générés pas encore mis à jour. Cast via unknown.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: { p_org_id: string },
    ) => Promise<{ data: unknown; error: unknown }>
  )('verify_audit_chain_integrity', {
    p_org_id: orgId,
  });
  if (error || !data) return null;

  const row = (data as unknown as Array<Record<string, unknown>>)[0];
  if (!row) return null;

  return {
    org_id: row.out_org_id as string,
    total_events: Number(row.out_total_events ?? 0),
    verified_events: Number(row.out_verified_events ?? 0),
    broken_at: row.out_broken_at != null ? Number(row.out_broken_at) : null,
    broken_event_id: (row.out_broken_event_id as string | null) ?? null,
    is_intact: Boolean(row.out_is_intact),
  };
}
