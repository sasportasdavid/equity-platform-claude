/**
 * PR #41 B3 — Resolver case-aware pour transformer un (resource_type,
 * resource_id) issu d'un audit_event en lien navigable vers la page détail.
 *
 * Conventions DB observées (cf B0 §3) :
 * - UPPERCASE : `PLAN`, `AWARD`, `BENEFICIARY`, `USER`, `MEMBERSHIP`,
 *   `VALUATION_RUN`, `DOCUMENT`
 * - snake_case : `approval_decision`, `approval_request`,
 *   `document_instance`, `signature_request`
 *
 * Le resolver normalise sur la lookup uniquement (lowercase) sans muter la
 * string display (label garde son casing original pour le tooltip + a11y).
 *
 * Routes vérifiées repo (5 mai 2026) :
 * - `/dashboard/plans/[id]` ✅
 * - `/dashboard/awards/[id]` ✅
 * - `/dashboard/beneficiaries/[id]` ✅
 * - `/dashboard/valuations/runs/[runId]` ✅ (note: segment `runs/`)
 * - `/dashboard/approvals/[requestId]` ✅
 *
 * Pas de route détail document V1.5 → label sans href (`exists: true,
 * href: null`). Pas de route user/membership → idem.
 */

import { shortHash } from './hash';

export type ResolvedResource = {
  /** URL vers la page détail, ou `null` si pas de page directe pour ce type. */
  href: string | null;
  /** Label affiché : "AWARD · #abc12345" ou label custom depuis metadata. */
  label: string;
  /**
   * `true` si le resource_type est connu (que la résolution donne un href ou
   * pas). `false` si le type est inconnu — UI montre alors "(introuvable)".
   */
  exists: boolean;
};

/**
 * Map `lowercase resource_type` → builder URL ou `null` (type connu mais
 * pas de page détail). Les types absents de la map sont considérés inconnus.
 */
const RESOLVERS: Record<string, ((id: string) => string) | null> = {
  // UPPERCASE convention
  plan: (id) => `/dashboard/plans/${id}`,
  award: (id) => `/dashboard/awards/${id}`,
  beneficiary: (id) => `/dashboard/beneficiaries/${id}`,
  valuation_run: (id) => `/dashboard/valuations/runs/${id}`,

  // snake_case convention
  approval_request: (id) => `/dashboard/approvals/${id}`,

  // Types connus mais sans page détail dédiée (label sans href)
  user: null,
  membership: null,
  document: null,
  document_instance: null,
  signature_request: null,
  approval_decision: null,
  organization: null,
};

function buildLabel(
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown> | null,
): string {
  const fromMetadata = readStringFromMetadata(metadata, [
    'resource_label',
    'plan_name',
    'award_id',
    'beneficiary_name',
    'name',
  ]);
  if (fromMetadata) return fromMetadata;
  return `${resourceType} · #${shortHash(resourceId.replace(/-/g, ''))}`;
}

function readStringFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  keys: ReadonlyArray<string>,
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const v = metadata[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

/**
 * Resout un (resource_type, resource_id) en `{href, label, exists}`.
 *
 * - resource_type vide/null → `exists: false`
 * - type inconnu → `exists: false`, label fallback "type · #xxxxxxxx"
 * - type connu sans page → `exists: true, href: null`
 * - type connu avec page → `exists: true, href: '/dashboard/...'`
 */
export function resolveResource(
  resourceType: string | null | undefined,
  resourceId: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): ResolvedResource {
  if (!resourceType || !resourceId) {
    return { href: null, label: '(ressource non spécifiée)', exists: false };
  }

  const key = resourceType.toLowerCase();
  const resolver = key in RESOLVERS ? RESOLVERS[key] : undefined;
  const label = buildLabel(resourceType, resourceId, metadata);

  if (resolver === undefined) {
    // Unknown type
    return { href: null, label, exists: false };
  }

  if (resolver === null) {
    // Known type, no detail page
    return { href: null, label, exists: true };
  }

  return { href: resolver(resourceId), label, exists: true };
}
