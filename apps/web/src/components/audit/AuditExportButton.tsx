'use client';

import * as React from 'react';
import { exportAuditReportJson } from '@/server/actions/audit-export-json';
import { exportAuditReportPdf } from '@/server/actions/audit-export-pdf';
import { exportAuditReportCsv } from '@/server/actions/audit-export-csv';

/**
 * PR #42 B5 — Bouton dropdown Export (3 formats : JSON signé · PDF · CSV).
 *
 * Client component : appelle la SA correspondante puis déclenche le download
 * via Blob + URL.createObjectURL → <a download>.
 *
 * URL state filters : récupérés via les searchParams passés en props (parent
 * RSC les passe depuis page.tsx). Pas de `useSearchParams` côté client →
 * cohérence avec le rendering server du reste de la page.
 *
 * UX :
 * - Loading state pendant le call SA (button disabled + label "Export…")
 * - Error state : message texte sous le bouton (auto-clear 5s)
 * - Success : déclenche le download natif, ferme le menu
 *
 * Permission gate : la SA retourne `{ ok: false, error: '...' }` si
 * audit.export non accordée, l'UI affiche le message.
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

export function AuditExportButton({ filters }: AuditExportButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<ExportFormat | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Click outside → close
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

  // Auto-clear error
  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  async function handleExport(format: ExportFormat) {
    setPending(format);
    setError(null);
    setOpen(false);

    try {
      let blob: Blob;
      let filename: string;

      if (format === 'json') {
        const result = await exportAuditReportJson(filters);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        blob = new Blob([result.json], { type: 'application/json;charset=utf-8' });
        filename = result.filename;
      } else if (format === 'csv') {
        const result = await exportAuditReportCsv(filters);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
        filename = result.filename;
      } else {
        const result = await exportAuditReportPdf(filters);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Decode base64 → Uint8Array → Blob (Server Action returns base64)
        const binary = atob(result.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: 'application/pdf' });
        filename = result.filename;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’export');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="cw-audit-export" ref={menuRef}>
      <button
        type="button"
        className="cw-audit-export-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={pending !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="audit-export-trigger"
      >
        {pending ? `Export ${pending.toUpperCase()}…` : 'Exporter ▾'}
      </button>

      {open ? (
        <div className="cw-audit-export-menu" role="menu" data-testid="audit-export-menu">
          <button
            type="button"
            className="cw-audit-export-item"
            role="menuitem"
            onClick={() => handleExport('json')}
            data-testid="audit-export-item-json"
          >
            <span className="cw-audit-export-item-label">JSON signé</span>
            <span className="cw-audit-export-item-hint">
              Format auditeur · re-vérifiable hors DB
            </span>
          </button>
          <button
            type="button"
            className="cw-audit-export-item"
            role="menuitem"
            onClick={() => handleExport('pdf')}
            data-testid="audit-export-item-pdf"
          >
            <span className="cw-audit-export-item-label">PDF</span>
            <span className="cw-audit-export-item-hint">
              Rapport scellé · pour CFO + auditeurs CAC
            </span>
          </button>
          <button
            type="button"
            className="cw-audit-export-item"
            role="menuitem"
            onClick={() => handleExport('csv')}
            data-testid="audit-export-item-csv"
          >
            <span className="cw-audit-export-item-label">CSV</span>
            <span className="cw-audit-export-item-hint">
              Excel-friendly · pour analyse comptable
            </span>
          </button>
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
