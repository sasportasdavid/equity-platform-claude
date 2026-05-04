'use client';

/**
 * Module 10 B6 — Wizard import CSV positions cap_table (3 steps).
 *
 * Step 1 : Upload + parse
 * Step 2 : Preview avec validation par row + summary
 * Step 3 : Submit atomique (Server Action bulkImportPositions)
 *
 * Pattern aligné sur Module 4 BulkImportBeneficiariesModal mais en
 * page entière (pas modale) car cap table import = action structurelle.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
} from 'lucide-react';
import {
  buildCsvTemplate,
  computeSummary,
  parsePositionsCsv,
  validateRow,
  type ImportSummary,
  type ParsedImportRow,
} from '@/components/captable/bulk-import-positions-helpers';
import { bulkImportPositions } from '@/server/actions/cap-table';
import { type ImportPositionRowInput, BULK_IMPORT_MAX_ROWS } from '@equity/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Step = 'upload' | 'preview' | 'done';

export function ImportPositionsWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [submitResult, setSubmitResult] = useState<{ created: number } | null>(null);

  const summary: ImportSummary | null = useMemo(
    () => (rows.length > 0 ? computeSummary(rows) : null),
    [rows],
  );

  function handleDownloadTemplate() {
    const csv = buildCsvTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cap_table_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFile(f: File) {
    setError(null);
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const { rows: parsed, error: parseErr } = parsePositionsCsv(text);
      if (parseErr) {
        setError(parseErr);
        setRows([]);
        return;
      }
      if (parsed.length > BULK_IMPORT_MAX_ROWS) {
        setError(
          `Trop de lignes (${parsed.length}). Maximum ${BULK_IMPORT_MAX_ROWS} positions par import.`,
        );
        setRows([]);
        return;
      }
      setRows(parsed);
      setStep('preview');
    };
    reader.onerror = () => setError('Échec lecture fichier');
    reader.readAsText(f);
  }

  function handleSubmit() {
    if (!summary || summary.invalid > 0) return;
    setError(null);
    const validRows: ImportPositionRowInput[] = rows
      .map((r) => validateRow(r))
      .filter((v): v is { valid: true; data: ImportPositionRowInput } => v.valid)
      .map((v) => v.data);

    startTransition(async () => {
      const result = await bulkImportPositions({ rows: validRows });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubmitResult({ created: result.summary.rowsCreated });
      setStep('done');
    });
  }

  // ─── Step 3 : done ───────────────────────────────────────────────────
  if (step === 'done' && submitResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-5 text-emerald-600" />
            Import réussi
          </CardTitle>
          <CardDescription>
            {submitResult.created} position{submitResult.created > 1 ? 's' : ''} créée
            {submitResult.created > 1 ? 's' : ''} dans la cap table.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => router.push('/dashboard/captable')}>Voir la cap table</Button>
          <Button
            variant="outline"
            onClick={() => {
              setStep('upload');
              setFile(null);
              setRows([]);
              setSubmitResult(null);
            }}
          >
            Importer un autre lot
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Step 2 : preview ────────────────────────────────────────────────
  if (step === 'preview' && summary) {
    const previewRows = rows.slice(0, 20);
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aperçu de l&apos;import — {file?.name}</CardTitle>
            <CardDescription>
              {summary.total} ligne{summary.total > 1 ? 's' : ''} parsée
              {summary.total > 1 ? 's' : ''} · {summary.valid} valide
              {summary.valid > 1 ? 's' : ''} · {summary.invalid} en erreur
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground text-overline">Par type</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(summary.byStakeholderType).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="font-mono text-xs">
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-overline">Par classe</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(summary.byShareClass).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="font-mono text-xs">
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {summary.invalid > 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>{summary.invalid} ligne(s) en erreur</AlertTitle>
                <AlertDescription>
                  L&apos;import est bloqué tant que toutes les lignes ne sont pas valides
                  (atomicité). Voir le détail dans le tableau ci-dessous.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Aperçu lignes 1—{Math.min(20, rows.length)}
              {rows.length > 20 ? ` (sur ${rows.length})` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-left">Nom</th>
                  <th className="px-2 py-1 text-left">Classe</th>
                  <th className="px-2 py-1 text-right">Units</th>
                  <th className="px-2 py-1 text-left">Acquis</th>
                  <th className="px-2 py-1 text-left">Statut</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => {
                  const v = validateRow(row);
                  return (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="text-muted-foreground px-2 py-1 font-mono">{i + 1}</td>
                      <td className="px-2 py-1 font-mono">{row.stakeholderType ?? '—'}</td>
                      <td className="px-2 py-1">{row.stakeholderName ?? '—'}</td>
                      <td className="px-2 py-1 font-mono">{row.shareClassCode ?? '—'}</td>
                      <td className="px-2 py-1 text-right font-mono">
                        {row.units !== undefined
                          ? new Intl.NumberFormat('fr-FR').format(row.units)
                          : '—'}
                      </td>
                      <td className="px-2 py-1 font-mono">{row.acquiredAt ?? '—'}</td>
                      <td className="px-2 py-1">
                        {v.valid ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-red-600" title={v.errors[0]?.message}>
                            ✗ {v.errors[0]?.message ?? 'invalide'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              setStep('upload');
              setFile(null);
              setRows([]);
            }}
            disabled={pending}
          >
            <ArrowLeft className="mr-1 size-4" />
            Retour
          </Button>
          <Button onClick={handleSubmit} disabled={pending || summary.invalid > 0}>
            {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Importer {summary.valid} position{summary.valid > 1 ? 's' : ''}
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── Step 1 : upload ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Format attendu</CardTitle>
          <CardDescription>
            CSV UTF-8 avec headers. Maximum {BULK_IMPORT_MAX_ROWS} positions par import. Toute ligne
            invalide bloque l&apos;import (atomicité — rollback complet).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm">
              <strong>Headers requis</strong> : <code>stakeholder_type</code>,{' '}
              <code>stakeholder_name</code>, <code>share_class_code</code>, <code>units</code>,{' '}
              <code>acquired_at</code>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Optionnels : <code>stakeholder_email</code> (requis si type=BENEFICIARY),{' '}
              <code>cost_basis_per_unit</code>, <code>notes</code>
            </p>
          </div>
          <Button variant="outline" onClick={handleDownloadTemplate} type="button">
            <Download className="mr-1 size-4" />
            Télécharger le template CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sélectionner un fichier</CardTitle>
        </CardHeader>
        <CardContent>
          <label
            htmlFor="csv-upload"
            className="border-paper-300 hover:border-brass-500 hover:bg-paper-50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-8 transition-colors"
          >
            <Upload className="text-ink-400 size-8" strokeWidth={1.5} />
            <span className="text-sm">{file ? file.name : 'Cliquer pour sélectionner un CSV'}</span>
            {file ? (
              <span className="text-muted-foreground text-xs">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            ) : null}
            <input
              id="csv-upload"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
