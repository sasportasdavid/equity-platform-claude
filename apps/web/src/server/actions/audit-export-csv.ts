'use server';

import { createHash } from 'node:crypto';
import { logAuditEvent } from '@/lib/audit';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import {
  AUDIT_EXPORT_MAX_EVENTS,
  getAllAuditEventsForExport,
  type AuditExportFilters,
} from '@/server/queries/audit-export';
import { buildAuditCsv } from '@/lib/audit/export-csv-builder';

/**
 * PR #42 B4 — Export CSV pour comptables / Excel.
 *
 * Bonus complémentaire au JSON signé (PRIMAIRE) — pas de signature
 * cryptographique car CSV est non-structurable pour `export_signature`.
 * Les colonnes `event_hash` + `previous_hash` permettent quand même un
 * audit visuel de la chaîne dans Excel.
 *
 * Sécurité : permission gate `audit.export` + émission `audit.exported`
 * event avec metadata.format='csv'.
 */

export type ExportCsvResult =
  | {
      ok: true;
      filename: string;
      csv: string;
      byteSize: number;
      eventCount: number;
      truncated: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export async function exportAuditReportCsv(
  filters: AuditExportFilters = {},
): Promise<ExportCsvResult> {
  const user = await requireUser();
  const canExport = await hasPermission('audit.export');
  if (!canExport) {
    return { ok: false, error: 'Permission audit.export requise (OWNER ou AUDITOR).' };
  }
  if (!user.activeOrgId) {
    return { ok: false, error: 'Aucune organisation active.' };
  }

  const events = await getAllAuditEventsForExport(filters);
  if (events.length === 0) {
    return { ok: false, error: 'Aucun événement à exporter pour les filtres fournis.' };
  }

  const truncated = events.length >= AUDIT_EXPORT_MAX_EVENTS;
  const csv = buildAuditCsv(events);
  const byteSize = Buffer.byteLength(csv, 'utf-8');

  // Hash 8-char short pour traçabilité (pas signature stricte)
  const csvDigest = createHash('sha256').update(csv).digest('hex').slice(0, 12);

  await logAuditEvent({
    eventType: 'audit.exported',
    resourceType: 'audit_export',
    metadata: {
      format: 'csv',
      filters,
      event_count: events.length,
      truncated,
      csv_digest_short: csvDigest,
      byte_size: byteSize,
    },
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: user.activeOrgId,
  });

  const today = new Date().toISOString().slice(0, 10);
  const orgShort = user.activeOrgId.slice(0, 8);
  const filename = `capiwise-audit-${orgShort}-${today}.csv`;

  return {
    ok: true,
    filename,
    csv,
    byteSize,
    eventCount: events.length,
    truncated,
  };
}
