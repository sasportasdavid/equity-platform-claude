import { createHash } from 'node:crypto';

/**
 * PR #39 B2 — Hash SHA-256 déterministe d'un audit_event.
 *
 * V1 : calcul **à la volée** côté serveur (RSC) — pas de colonne
 * `audit_events.hash_sha256` en DB. V2 (PR #41) : trigger DB INSERT qui
 * stocke le hash + chaîne tamper-evident (chained hashes).
 *
 * Le payload concaténé est stable :
 *   `id|event_type|user_id|resource_type|resource_id|occurred_at|JSON(metadata)`
 *
 * → même input = même output. Différents events = hashes différents.
 *
 * Utilisation côté Node uniquement (createHash from 'node:crypto'). Si
 * besoin client-side futur : Web Crypto API (`crypto.subtle.digest`).
 */

export type AuditEventForHash = {
  id: string;
  event_type: string;
  user_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  occurred_at: string;
  metadata?: Record<string, unknown> | null;
};

/** Calcule le SHA-256 hex (64 chars) d'un audit_event. */
export function computeAuditEventHash(event: AuditEventForHash): string {
  const payload = [
    event.id,
    event.event_type,
    event.user_id ?? '',
    event.resource_type ?? '',
    event.resource_id ?? '',
    event.occurred_at,
    JSON.stringify(event.metadata ?? {}),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

/** Tronque un hash hex à ses 8 premiers chars (pour affichage UI). */
export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}
