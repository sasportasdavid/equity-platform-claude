'use client';

import * as React from 'react';

/**
 * PR #45 B2 — Bouton dropdown Export refactoré pour utiliser le route
 * handler `/api/audit/export` (HOTFIX PR #42 Bug #3 + #4).
 *
 * Avant (PR #42) : appel `await exportAuditReportJson(filters)` Server
 * Action → décode base64 → Blob → URL.createObjectURL → a.click().
 * Causait :
 *   - Bug #4 P0 PDF infinite RSC loop (Next.js SA workflow + auto router refresh)
 *   - Bug #3 P1 JSON silent download (même mécanisme)
 *
 * Après : `<a href="/api/audit/export?format=...&...">` direct download
 * natif. Browser handle Content-Disposition: attachment automatiquement.
 * Pas de Server Action workflow, pas de roundtrip JS, pas de revalidation
 * RSC. Fix les 2 bugs par construction.
 *
 * Permission gate : géré côté route handler (retourne 403 JSON si pas
 * audit.export). Le UI affiche l'erreur via `download` event listener.
 *
 * Cf memory/pr_45_hotfix_export_audit_b0.md.
 */

export type AuditExportFiltersClient = {
  from?: string | undefined;
  to?: string | undefined;
  eventTypePrefix?: string | undefined;
};

export type AuditExportButtonProps = {
  filters: AuditExportFiltersClient;
};

type ExportFormat = 'json' | 'pdf' | 'csv';

const FORMAT_LABELS: Record<ExportFormat, { label: string; hint: string }> = {
  json: {
    label: 'JSON signé',
    hint: 'Format auditeur · re-vérifiable hors DB',
  },
  pdf: {
    label: 'PDF',
    hint: 'Rapport scellé · pour CFO + auditeurs CAC',
  },
  csv: {
    label: 'CSV',
    hint: 'Excel-friendly · pour analyse comptable',
  },
};

function buildExportUrl(format: ExportFormat, filters: AuditExportFiltersClient): string {
  const params = new URLSearchParams({ format });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.eventTypePrefix && filters.eventTypePrefix !== 'all') {
    params.set('type', filters.eventTypePrefix);
  }
  return `/api/audit/export?${params.toString()}`;
}

export function AuditExportButton({ filters }: AuditExportButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  /**
   * Pre-flight check : tente HEAD pour détecter 403/401/404 avant le
   * download natif. Si OK, déclenche le download via window.location.
   * Si erreur, affiche le message inline (pas de download cassé silencieux).
   */
  async function handleExport(format: ExportFormat) {
    setOpen(false);
    setError(null);
    const url = buildExportUrl(format, filters);

    try {
      // Pre-flight HEAD pour valider la permission avant de déclencher
      // le download. Si HEAD retourne 200 → OK, sinon affiche l'erreur.
      // (HEAD n'envoie pas le body, juste les headers — léger.)
      const headResp = await fetch(url, { method: 'HEAD' });
      if (!headResp.ok) {
        // Tenter un GET pour récupérer le message JSON détaillé
        const getResp = await fetch(url, { method: 'GET' });
        if (!getResp.ok) {
          let msg = `Erreur ${getResp.status}`;
          try {
            const data = (await getResp.json()) as { error?: string };
            if (data.error) msg = data.error;
          } catch {
            // pas du JSON, garder le code HTTP
          }
          setError(msg);
          return;
        }
      }

      // OK → trigger native download via <a download>
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      // L'attribut download laisse le browser décider du nom de fichier
      // (tiré de Content-Disposition côté server). On peut aussi
      // hardcoder ici mais le server est plus précis.
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'export");
    }
  }

  return (
    <div className="cw-audit-export" ref={menuRef}>
      <button
        type="button"
        className="cw-audit-export-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="audit-export-trigger"
      >
        Exporter ▾
      </button>

      {open ? (
        <div className="cw-audit-export-menu" role="menu" data-testid="audit-export-menu">
          {(['json', 'pdf', 'csv'] as ExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              className="cw-audit-export-item"
              role="menuitem"
              onClick={() => handleExport(format)}
              data-testid={`audit-export-item-${format}`}
            >
              <span className="cw-audit-export-item-label">{FORMAT_LABELS[format].label}</span>
              <span className="cw-audit-export-item-hint">{FORMAT_LABELS[format].hint}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="cw-audit-export-error" role="alert" data-testid="audit-export-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
