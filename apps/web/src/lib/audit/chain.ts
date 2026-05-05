/**
 * PR #42 B1.5 — Helpers TS pour la hash chain SHA-256 (Module 13 V2).
 *
 * V2 introduit 3 nouvelles colonnes sur `audit_events` :
 * - `event_hash` (text 64 hex) — SHA-256 du payload canonical || previous_hash
 * - `previous_hash` (text 64 hex) — event_hash du previous event de la chaîne org
 * - `chain_position` (bigint) — position monotone par org (UNIQUE per org_id)
 *
 * Ces colonnes sont **calculées par le trigger DB** (BEFORE INSERT assigne
 * chain_position via advisory lock per-org, AFTER INSERT calcule le hash via
 * RPC `compute_audit_chain_hash`). Le trigger BEFORE UPDATE bloque toute modif
 * sur ces colonnes + sur les champs hashés (immutability).
 *
 * Stratégie V1 = mark-and-sweep (cf MODULE_13_AUDIT_TRAIL.md §3.3 Option A) :
 * les 286 events pré-Module 13 restent avec `event_hash = NULL` et
 * `chain_position = NULL`. Le helper `getAuditEventHash` priorise la colonne
 * DB et fallback sur le compute on-the-fly (PR #39) pour ces events legacy.
 *
 * **Re-compute côté TS** : la canonical form Postgres `jsonb_build_object().::text`
 * trie les keys par longueur puis alpha (storage rule jsonb), avec séparateur
 * `": "` et `", "`. Reproduire exactement côté TS = ~50 LOC + risque de drift.
 * V1 délègue donc la verification offline à la RPC `verify_audit_chain_integrity`.
 * V1.X portera la canonical form en TS pour permettre la verification d'un
 * export JSON sans accès DB (auditeur externe).
 */

import { computeAuditEventHash, type AuditEventForHash } from './hash';

/**
 * Genesis hash V1 — string dérivée fixe pour Module 13 V2.
 * Doit être identique au constant SQL `CAPIWISE_AUDIT_GENESIS_2026_05`.
 * Le hash SHA-256 hex de cette string est le previous_hash virtuel pour le
 * 1er event de chaque chaîne org.
 */
export const AUDIT_CHAIN_GENESIS_SOURCE = 'CAPIWISE_AUDIT_GENESIS_2026_05' as const;

/**
 * Type étendu : un audit_event peut maintenant porter les colonnes hash chain
 * (V2) en plus des champs hash legacy (V1 PR #39).
 */
export type AuditEventWithChain = AuditEventForHash & {
  /** SHA-256 hex (64 chars) — NULL pour events pré-Module 13. */
  event_hash?: string | null;
  /** SHA-256 hex (64 chars) — NULL pour le genesis event de chaque org. */
  previous_hash?: string | null;
  /** Position monotone dans la chaîne par org — NULL pour events pré-Module 13. */
  chain_position?: number | null;
};

/**
 * Récupère le hash d'un audit_event avec priorité DB (tamper-evident V2),
 * fallback sur le compute on-the-fly V1 (events pré-Module 13 ou avant trigger).
 *
 * @param event audit_event row (avec ou sans colonnes V2)
 * @returns hex string 64 chars
 */
export function getAuditEventHash(event: AuditEventWithChain): string {
  if (event.event_hash && /^[0-9a-f]{64}$/i.test(event.event_hash)) {
    return event.event_hash;
  }
  return computeAuditEventHash(event);
}

/**
 * Vérifie qu'un event a bien été chained (V2 column populated).
 * Utile pour le badge UI "Empreinte vérifiée DB" vs "Empreinte calculée à la volée".
 */
export function isChained(event: AuditEventWithChain): boolean {
  return (
    typeof event.chain_position === 'number' &&
    event.chain_position > 0 &&
    typeof event.event_hash === 'string' &&
    /^[0-9a-f]{64}$/i.test(event.event_hash)
  );
}

/**
 * Filtre les events qui font partie de la chaîne (mark-and-sweep V1 :
 * exclut les events pré-Module 13 avec chain_position = null).
 * Retourne triés par chain_position croissante (genesis en premier).
 */
export function chainedEventsOrdered(
  events: ReadonlyArray<AuditEventWithChain>,
): AuditEventWithChain[] {
  return events
    .filter((e) => typeof e.chain_position === 'number' && e.chain_position! > 0)
    .sort((a, b) => (a.chain_position ?? 0) - (b.chain_position ?? 0));
}

/**
 * Vérification de l'intégrité de la chaîne côté client basée sur les
 * colonnes DB (event_hash + previous_hash + chain_position).
 *
 * V1 : ne RECALCULE PAS le hash localement (cf header — canonical form Postgres
 * non portée TS V1). Vérifie uniquement les liens previous_hash ↔ event_hash.
 * L'intégrité réelle (hash matche les fields) est attestée par le trigger DB
 * immutability + la RPC `verify_audit_chain_integrity`.
 *
 * Returns :
 * - `valid: true` si chaque event[n].previous_hash === event[n-1].event_hash
 *   (et event[0].previous_hash === null pour le genesis)
 * - `valid: false` avec brokenAt = chain_position du break
 *
 * V1.X : ajouter la canonical re-compute pour vérification totalement offline.
 */
export type ChainCheckResult =
  | { valid: true; totalEvents: number }
  | { valid: false; totalEvents: number; brokenAt: number; reason: string };

export function verifyChainLinkage(events: ReadonlyArray<AuditEventWithChain>): ChainCheckResult {
  const ordered = chainedEventsOrdered(events);
  if (ordered.length === 0) {
    return { valid: true, totalEvents: 0 };
  }

  // Genesis : previous_hash MUST be null
  const genesis = ordered[0]!;
  if (genesis.chain_position !== 1) {
    return {
      valid: false,
      totalEvents: ordered.length,
      brokenAt: genesis.chain_position!,
      reason: `Genesis event (premier de la chaîne) doit avoir chain_position = 1, observé : ${genesis.chain_position}`,
    };
  }
  if (genesis.previous_hash !== null && genesis.previous_hash !== undefined) {
    return {
      valid: false,
      totalEvents: ordered.length,
      brokenAt: 1,
      reason: 'Genesis event doit avoir previous_hash = null',
    };
  }

  // Subsequent events : chain_position monotone + previous_hash matches predecessor
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;

    if (cur.chain_position !== (prev.chain_position ?? 0) + 1) {
      return {
        valid: false,
        totalEvents: ordered.length,
        brokenAt: cur.chain_position!,
        reason: `chain_position non-monotone à position ${cur.chain_position} (précédent : ${prev.chain_position})`,
      };
    }

    if (cur.previous_hash !== prev.event_hash) {
      return {
        valid: false,
        totalEvents: ordered.length,
        brokenAt: cur.chain_position!,
        reason: `previous_hash ne correspond pas au event_hash du prédécesseur à position ${cur.chain_position}`,
      };
    }
  }

  return { valid: true, totalEvents: ordered.length };
}
