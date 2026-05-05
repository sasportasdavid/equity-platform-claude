'use server';

import { createHash } from 'node:crypto';
import { logAuditEvent } from '@/lib/audit';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import {
  AUDIT_EXPORT_MAX_EVENTS,
  getAllAuditEventsForExport,
  getAuditChainIntegrity,
  type AuditExportFilters,
} from '@/server/queries/audit-export';
import { buildAuditExportJson, type AuditExportJsonPayload } from '@/lib/audit/export-json-builder';

/**
 * @deprecated PR #45 — UI appelle désormais le route handler
 * `/api/audit/export?format=json` (cf `apps/web/src/app/api/audit/export/route.ts`).
 * Cette Server Action reste exportée pour les tests Vitest (couverture
 * permission gate + builder + signature). Pas appelée depuis l'UI.
 * V1.X = sortir le core en `lib/audit/export-helpers.ts` partagés.
 *
 * PR #42 B2 — Export JSON signé (PRIMAIRE V1).
 *
 * Spec MODULE_13_AUDIT_TRAIL.md §7.3 figée :
 * - Format JSON canonical avec format_version, generated_by, range, integrity,
 *   events[], export_signature{algorithm: 'SHA-256', value: hash_du_payload}
 * - export_signature = SHA-256 hex du payload entier sans le champ signature
 *   (self-integrity check, pas crypto asymétrique V1 → ED25519 = dette V1.X
 *   #120 timestamping notarial)
 *
 * User extensions :
 * - integrity.chain_head_hash (event_hash du dernier event chained)
 * - integrity.chain_position_max
 * - integrity.events_signed (count des events avec event_hash != NULL)
 * - integrity.verify_endpoint_url (URL absolue vers la RPC server pour
 *   re-vérification offline depuis un client externe)
 *
 * Sécurité :
 * - Permission gate `audit.export` (seedée Module 1, OWNER + AUDITOR)
 * - Émet `audit.exported` event AVANT retour (méta-traçabilité — l'export
 *   devient lui-même un event chained dans la suite de la timeline)
 * - Cap V1 : 10 000 events / export (cf brief §"Pièges connus" #5)
 *
 * Returns un Result discriminé pour le client (pas de throw qui propage
 * dans le bundle).
 */

export type ExportJsonResult =
  | {
      ok: true;
      filename: string;
      json: string;
      byteSize: number;
      eventCount: number;
      truncated: boolean; // true si on a hit le cap MAX_EVENTS
    }
  | {
      ok: false;
      error: string;
    };

export async function exportAuditReportJson(
  filters: AuditExportFilters = {},
): Promise<ExportJsonResult> {
  // 1. Auth + permission gate
  const user = await requireUser();
  const canExport = await hasPermission('audit.export');
  if (!canExport) {
    return { ok: false, error: 'Permission audit.export requise (OWNER ou AUDITOR).' };
  }
  if (!user.activeOrgId) {
    return { ok: false, error: 'Aucune organisation active.' };
  }

  // 2. Fetch events + integrity (parallèle)
  const [events, integrity] = await Promise.all([
    getAllAuditEventsForExport(filters),
    getAuditChainIntegrity(user.activeOrgId),
  ]);

  if (events.length === 0) {
    return { ok: false, error: 'Aucun événement à exporter pour les filtres fournis.' };
  }

  // 3. Build payload (sans export_signature)
  const truncated = events.length >= AUDIT_EXPORT_MAX_EVENTS;
  const payload: AuditExportJsonPayload = buildAuditExportJson({
    generatedBy: {
      user_id: user.id,
      user_email: user.email ?? '',
      org_id: user.activeOrgId,
      org_name: null, // sera enrichi B5 quand on injecte org name côté UI
    },
    filters,
    integrity: integrity ?? null,
    events,
    truncated,
  });

  // 4. Compute SHA-256 self-integrity signature
  const canonicalWithoutSig = JSON.stringify(payload);
  const signature = createHash('sha256').update(canonicalWithoutSig).digest('hex');

  // 5. Inject signature into final
  const final = {
    ...payload,
    export_signature: { algorithm: 'SHA-256' as const, value: signature },
  };
  const json = JSON.stringify(final, null, 2);
  const byteSize = Buffer.byteLength(json, 'utf-8');

  // 6. Méta-traçabilité : émettre un event audit.exported.
  //    Best-effort (logAuditEvent ne throw pas — cf lib/audit/index.ts).
  const chainPositionMax = payload.integrity.chain_position_max;
  await logAuditEvent({
    eventType: 'audit.exported',
    resourceType: 'audit_export',
    metadata: {
      format: 'json',
      filters,
      event_count: events.length,
      truncated,
      chain_position_max: chainPositionMax,
      export_signature_short: signature.slice(0, 12),
      byte_size: byteSize,
    },
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: user.activeOrgId,
  });

  // 7. Filename : capiwise-audit-{org_short}-{YYYY-MM-DD}.json
  const today = new Date().toISOString().slice(0, 10);
  const orgShort = user.activeOrgId.slice(0, 8);
  const filename = `capiwise-audit-${orgShort}-${today}.json`;

  return {
    ok: true,
    filename,
    json,
    byteSize,
    eventCount: events.length,
    truncated,
  };
}
