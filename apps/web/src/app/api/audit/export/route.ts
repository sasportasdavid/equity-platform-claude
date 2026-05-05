import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
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
import { buildAuditCsv } from '@/lib/audit/export-csv-builder';
import { AuditReportPdf } from '@/lib/audit/audit-report-pdf';

/**
 * PR #45 B1 — Route handler `/api/audit/export` (HOTFIX PR #42).
 *
 * Remplace le pattern Server Action returns base64 (qui causait :
 * - Bug #4 P0 : 345+ requêtes RSC parallèles + freeze UI sur PDF
 * - Bug #3 P1 : silent download sur JSON
 * — vraie cause = Next.js Server Action workflow + auto router refresh).
 *
 * Avantages route handler :
 * - Pas de SA workflow Next.js → pas de router refresh implicite
 * - Streaming binaire natif via Response (pas de base64 roundtrip)
 * - Browser handle natif Content-Disposition: attachment → download direct
 *
 * GET /api/audit/export?format=json|pdf|csv&from=YYYY-MM-DD&to=...&type=plan
 *
 * Sécurité :
 * - Permission gate `audit.export` (couche 1)
 * - org_id check (couche 2)
 * - Format whitelist (couche 3)
 * - Émet `audit.exported` APRÈS construction réussie du buffer, AVANT return
 *   Response — si la construction crash, pas d'audit émis (cohérence).
 *
 * Cf docs/QA_SETUP.md + memory/pr_45_hotfix_export_audit_b0.md.
 */

const VALID_FORMATS = ['json', 'pdf', 'csv'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

const MIME_TYPES: Record<ExportFormat, string> = {
  json: 'application/json; charset=utf-8',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
};

export async function GET(request: NextRequest): Promise<Response> {
  // === Couche 1 — Auth + permission gate ===
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const canExport = await hasPermission('audit.export');
  if (!canExport) {
    return NextResponse.json(
      { error: 'Permission audit.export requise (OWNER ou AUDITOR).' },
      { status: 403 },
    );
  }

  // === Couche 2 — org check ===
  if (!user.activeOrgId) {
    return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 400 });
  }

  // === Couche 3 — Format whitelist ===
  const sp = request.nextUrl.searchParams;
  const formatRaw = sp.get('format');
  if (!formatRaw || !VALID_FORMATS.includes(formatRaw as ExportFormat)) {
    return NextResponse.json(
      { error: `Format invalide. Attendu : ${VALID_FORMATS.join(' | ')}` },
      { status: 400 },
    );
  }
  const format = formatRaw as ExportFormat;

  const filters: AuditExportFilters = {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    eventTypePrefix: sp.get('type') ?? undefined,
  };

  // === Build payload ===
  const events = await getAllAuditEventsForExport(filters);
  if (events.length === 0) {
    return NextResponse.json(
      { error: 'Aucun événement à exporter pour les filtres fournis.' },
      { status: 404 },
    );
  }

  const truncated = events.length >= AUDIT_EXPORT_MAX_EVENTS;
  const today = new Date().toISOString().slice(0, 10);
  const orgShort = user.activeOrgId.slice(0, 8);
  const filename = `capiwise-audit-${orgShort}-${today}.${format}`;

  let body: Buffer | string;
  let signatureShort: string | undefined;
  let chainPositionMax: number | null = null;

  try {
    if (format === 'json') {
      const integrity = await getAuditChainIntegrity(user.activeOrgId);
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
      const canonicalWithoutSig = JSON.stringify(payload);
      const signature = createHash('sha256').update(canonicalWithoutSig).digest('hex');
      signatureShort = signature.slice(0, 12);
      chainPositionMax = payload.integrity.chain_position_max;

      body = JSON.stringify(
        { ...payload, export_signature: { algorithm: 'SHA-256', value: signature } },
        null,
        2,
      );
    } else if (format === 'csv') {
      body = buildAuditCsv(events);
      signatureShort = createHash('sha256').update(body).digest('hex').slice(0, 12);
    } else {
      // PDF
      const integrity = await getAuditChainIntegrity(user.activeOrgId);
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
      const canonicalWithoutSig = JSON.stringify(payload);
      const exportSignature = createHash('sha256').update(canonicalWithoutSig).digest('hex');
      signatureShort = exportSignature.slice(0, 12);
      chainPositionMax = payload.integrity.chain_position_max;

      body = await renderToBuffer(AuditReportPdf({ payload, events, exportSignature }));
    }
  } catch (err) {
    console.error('[audit-export] build failed', { format, err });
    return NextResponse.json(
      { error: `Erreur lors de la construction de l'export ${format.toUpperCase()}.` },
      { status: 500 },
    );
  }

  // === Audit emission APRÈS construction réussie, AVANT envoi de la response ===
  // Best-effort (logAuditEvent ne throw pas, cf lib/audit/index.ts).
  // Pas de risque de "lost in stream" puisque le buffer/string est déjà construit.
  await logAuditEvent({
    eventType: 'audit.exported',
    resourceType: 'audit_export',
    metadata: {
      format,
      filters,
      event_count: events.length,
      truncated,
      chain_position_max: chainPositionMax,
      export_signature_short: signatureShort,
      byte_size: typeof body === 'string' ? Buffer.byteLength(body, 'utf-8') : body.byteLength,
      transport: 'route_handler', // distingue de l'ancien pattern SA
    },
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: user.activeOrgId,
  });

  // === Response avec download natif ===
  // Buffer (Node) implémente ArrayBufferView mais TS lib.dom strict
  // n'autorise que ArrayBuffer / Blob / FormData / etc. dans BodyInit.
  // On cast via `as unknown as BodyInit` — runtime OK car Next.js Response
  // accepte les Buffers nativement (cf next/server runtime).
  const responseBody = (typeof body === 'string' ? body : body) as unknown as BodyInit;
  return new Response(responseBody, {
    status: 200,
    headers: {
      'Content-Type': MIME_TYPES[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
