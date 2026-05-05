import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * PR #41 B4 — Query détail d'un audit_event pour le drawer V1.5.
 *
 * Sélectionne TOUTES les colonnes (incl. `before_state` / `after_state` que la
 * liste paginée `getAuditEvents` n'inclut PAS — économie de bytes sur les pages
 * de 50 events où 90% des rows ont before/after = NULL).
 *
 * Sécurité : `createSupabaseServerClient()` (cookie-based JWT) → la RLS
 * `audit_events_select` (org_id = current_org_id() AND has_permission(
 * 'audit.read')) s'applique automatiquement. Une lookup d'un event d'une
 * autre org ou par un user sans la perm retourne null silencieusement.
 *
 * **Pas** d'admin client ici (sinon bypass RLS = leak inter-org).
 */

export type AuditEventDetail = {
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
};

export async function getAuditEventById(id: string): Promise<AuditEventDetail | null> {
  if (!id) return null;
  // Validation UUID minimal pour éviter les calls inutiles pour des id
  // malformés (ex `?event=foo`). RLS aurait quand même renvoyé null mais on
  // évite le round-trip + on protège contre une future Postgres erreur de
  // cast (UUID columns).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('audit_events')
    .select(
      'id, org_id, user_id, user_email, event_type, resource_type, resource_id, metadata, before_state, after_state, occurred_at, ip_address, user_agent, request_id',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
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
  };
}
