/**
 * PR #42 B2 — Builder pure du payload JSON d'export audit (lib pure, testable
 * sans Vitest+Supabase mocks).
 *
 * Le builder construit le payload SANS le `export_signature` final (qui est
 * calculé côté Server Action après JSON.stringify). Le Server Action injecte
 * `export_signature: { algorithm: 'SHA-256', value: <hash> }` ensuite.
 *
 * Format spec MODULE_13_AUDIT_TRAIL.md §7.3 + extensions user PR #42 :
 * - integrity.chain_head_hash (event_hash du dernier event chained)
 * - integrity.chain_position_max
 * - integrity.events_signed (count avec event_hash != NULL)
 * - integrity.verify_endpoint_url (RPC URL pour re-vérif offline)
 */

import type {
  AuditEventForExport,
  AuditChainIntegrityRow,
  AuditExportFilters,
} from '@/server/queries/audit-export';
import { AUDIT_CHAIN_GENESIS_SOURCE } from './chain';

/** Version du format export JSON. Bump si schéma breaking change. */
export const AUDIT_EXPORT_FORMAT_VERSION = '1.0' as const;

export type AuditExportGeneratedBy = {
  user_id: string;
  user_email: string;
  org_id: string;
  org_name: string | null;
};

export type AuditExportRange = {
  from: string | null;
  to: string | null;
  event_type_prefix: string | null;
};

export type AuditExportIntegrity = {
  algorithm: 'SHA-256';
  genesis_source: typeof AUDIT_CHAIN_GENESIS_SOURCE;
  total_events: number;
  verified_events: number;
  events_signed: number;
  is_intact: boolean;
  broken_at: number | null;
  broken_event_id: string | null;
  chain_head_hash: string | null;
  chain_position_max: number | null;
  /** URL absolue vers la RPC `verify_audit_chain_integrity` pour re-vérif offline. */
  verify_endpoint_url: string;
};

export type AuditExportJsonPayload = {
  format_version: typeof AUDIT_EXPORT_FORMAT_VERSION;
  generated_at: string; // ISO 8601 UTC
  generated_by: AuditExportGeneratedBy;
  range: AuditExportRange;
  integrity: AuditExportIntegrity;
  events: ReadonlyArray<AuditEventExportRow>;
  truncated: boolean; // true si l'export a hit le cap MAX_EVENTS
};

/**
 * Représentation d'un event dans l'export JSON. Strict subset de
 * `AuditEventForExport` pour publier uniquement les champs auditables (omet
 * ip_address, user_agent, request_id qui sont sensibles + déjà inclus dans
 * le hash chain via canonical_audit_payload côté SQL).
 */
export type AuditEventExportRow = {
  id: string;
  chain_position: number | null;
  occurred_at: string;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  event_hash: string | null;
  previous_hash: string | null;
};

export type BuildAuditExportJsonInput = {
  generatedBy: AuditExportGeneratedBy;
  filters: AuditExportFilters;
  integrity: AuditChainIntegrityRow | null;
  events: ReadonlyArray<AuditEventForExport>;
  truncated: boolean;
  /** Override l'URL de verify endpoint pour les tests / preview / staging. */
  verifyEndpointUrl?: string;
};

const DEFAULT_VERIFY_ENDPOINT_URL = 'https://capiwise.com/api/audit/verify-chain';

export function buildAuditExportJson(input: BuildAuditExportJsonInput): AuditExportJsonPayload {
  const {
    generatedBy,
    filters,
    integrity,
    events,
    truncated,
    verifyEndpointUrl = DEFAULT_VERIFY_ENDPOINT_URL,
  } = input;

  // chain_head = dernier event avec chain_position non-null (events triés ASC).
  const chainedEvents = events.filter(
    (e) => typeof e.chain_position === 'number' && e.chain_position > 0,
  );
  const chainHead = chainedEvents.length > 0 ? chainedEvents[chainedEvents.length - 1]! : null;
  const eventsSigned = chainedEvents.filter((e) => Boolean(e.event_hash)).length;

  return {
    format_version: AUDIT_EXPORT_FORMAT_VERSION,
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
    range: {
      from: filters.from ?? null,
      to: filters.to ?? null,
      event_type_prefix:
        filters.eventTypePrefix && filters.eventTypePrefix !== 'all'
          ? filters.eventTypePrefix
          : null,
    },
    integrity: {
      algorithm: 'SHA-256',
      genesis_source: AUDIT_CHAIN_GENESIS_SOURCE,
      total_events: integrity?.total_events ?? 0,
      verified_events: integrity?.verified_events ?? 0,
      events_signed: eventsSigned,
      is_intact: integrity?.is_intact ?? true,
      broken_at: integrity?.broken_at ?? null,
      broken_event_id: integrity?.broken_event_id ?? null,
      chain_head_hash: chainHead?.event_hash ?? null,
      chain_position_max: chainHead?.chain_position ?? null,
      verify_endpoint_url: verifyEndpointUrl,
    },
    events: events.map((e) => ({
      id: e.id,
      chain_position: e.chain_position,
      occurred_at: e.occurred_at,
      user_id: e.user_id,
      user_email: e.user_email,
      event_type: e.event_type,
      resource_type: e.resource_type,
      resource_id: e.resource_id,
      before_state: e.before_state,
      after_state: e.after_state,
      metadata: e.metadata,
      event_hash: e.event_hash,
      previous_hash: e.previous_hash,
    })),
    truncated,
  };
}
