'use server';

import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { logAuditEvent } from '@/lib/audit';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import {
  AUDIT_EXPORT_MAX_EVENTS,
  getAllAuditEventsForExport,
  getAuditChainIntegrity,
  type AuditExportFilters,
} from '@/server/queries/audit-export';
import { buildAuditExportJson } from '@/lib/audit/export-json-builder';
import { AuditReportPdf } from '@/lib/audit/audit-report-pdf';

/**
 * PR #42 B3 — Export PDF du registre d'audit (sealed report).
 *
 * Render via `@react-pdf/renderer` (Module 6 pattern). Réutilise le builder
 * JSON pour construire le payload `integrity` puis injecte le rendu PDF.
 *
 * La signature SHA-256 affichée en dernière page du PDF est la **même**
 * que celle de l'export JSON (même payload canonical) — un auditeur peut
 * confronter les 2 exports.
 *
 * Sécurité : permission gate `audit.export` + émission `audit.exported`
 * event avec metadata.format='pdf'.
 *
 * Returns base64 string (le client le décode en Blob via `atob` + `Uint8Array`
 * pour déclencher le download). Pas de Blob direct (Server Actions ne
 * sérialisent pas les Buffers binaires nativement).
 */

export type ExportPdfResult =
  | {
      ok: true;
      filename: string;
      base64: string; // PDF binary base64-encoded
      byteSize: number;
      eventCount: number;
      truncated: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export async function exportAuditReportPdf(
  filters: AuditExportFilters = {},
): Promise<ExportPdfResult> {
  const user = await requireUser();
  const canExport = await hasPermission('audit.export');
  if (!canExport) {
    return { ok: false, error: 'Permission audit.export requise (OWNER ou AUDITOR).' };
  }
  if (!user.activeOrgId) {
    return { ok: false, error: 'Aucune organisation active.' };
  }

  const [events, integrity] = await Promise.all([
    getAllAuditEventsForExport(filters),
    getAuditChainIntegrity(user.activeOrgId),
  ]);

  if (events.length === 0) {
    return { ok: false, error: 'Aucun événement à exporter pour les filtres fournis.' };
  }

  const truncated = events.length >= AUDIT_EXPORT_MAX_EVENTS;
  const payload = buildAuditExportJson({
    generatedBy: {
      user_id: user.id,
      user_email: user.email ?? '',
      org_id: user.activeOrgId,
      org_name: null,
    },
    filters,
    integrity: integrity ?? null,
    events,
    truncated,
  });

  // Signature = SHA-256 du payload canonical (mêmes bytes que l'export JSON
  // pour permettre de confronter les 2 exports — auditeur compare).
  const canonicalWithoutSig = JSON.stringify(payload);
  const exportSignature = createHash('sha256').update(canonicalWithoutSig).digest('hex');

  // Render PDF
  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(AuditReportPdf({ payload, events, exportSignature }));
  } catch (err) {
    console.error('[audit-export-pdf] renderToBuffer failed', err);
    return { ok: false, error: 'Erreur lors du rendu PDF.' };
  }

  const byteSize = buffer.byteLength;
  const base64 = buffer.toString('base64');

  // Méta-traçabilité
  await logAuditEvent({
    eventType: 'audit.exported',
    resourceType: 'audit_export',
    metadata: {
      format: 'pdf',
      filters,
      event_count: events.length,
      truncated,
      chain_position_max: payload.integrity.chain_position_max,
      export_signature_short: exportSignature.slice(0, 12),
      byte_size: byteSize,
    },
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: user.activeOrgId,
  });

  const today = new Date().toISOString().slice(0, 10);
  const orgShort = user.activeOrgId.slice(0, 8);
  const filename = `capiwise-audit-${orgShort}-${today}.pdf`;

  return {
    ok: true,
    filename,
    base64,
    byteSize,
    eventCount: events.length,
    truncated,
  };
}
