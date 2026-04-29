'use client';

import { useEffect, useReducer, useRef, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { bulkCreateBeneficiaries } from '@/server/actions/beneficiaries';
import {
  parseBeneficiariesCsv,
  validateBeneficiaryRows,
  type ParsedBeneficiaryRow,
  type RowValidationResult,
} from './bulk-import-helpers';

type Step = 1 | 2 | 3;

type ImportError = { rowIndex: number; email?: string; message: string; severity?: string };

type ImportResult =
  | { kind: 'success'; created: number; skipped: number }
  | { kind: 'partial'; created: number; skipped: number; errors: ImportError[] }
  | { kind: 'error'; error: string };

type State = {
  step: Step;
  fileName: string | null;
  fileSize: number | null;
  parsedRows: ParsedBeneficiaryRow[];
  rowValidations: RowValidationResult[];
  parseError: string | null;
  result: ImportResult | null;
};

type Action =
  | { type: 'reset' }
  | {
      type: 'set_file';
      fileName: string;
      fileSize: number;
      parsedRows: ParsedBeneficiaryRow[];
      validations: RowValidationResult[];
      parseError: string | null;
    }
  | { type: 'clear_file' }
  | { type: 'goto'; step: Step }
  | { type: 'set_result'; result: ImportResult };

const initialState: State = {
  step: 1,
  fileName: null,
  fileSize: null,
  parsedRows: [],
  rowValidations: [],
  parseError: null,
  result: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return initialState;
    case 'set_file':
      return {
        ...state,
        fileName: action.fileName,
        fileSize: action.fileSize,
        parsedRows: action.parsedRows,
        rowValidations: action.validations,
        parseError: action.parseError,
      };
    case 'clear_file':
      return {
        ...state,
        fileName: null,
        fileSize: null,
        parsedRows: [],
        rowValidations: [],
        parseError: null,
      };
    case 'goto':
      return { ...state, step: action.step };
    case 'set_result':
      return { ...state, result: action.result, step: 3 };
    default:
      return state;
  }
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 500;

/**
 * Wizard 3 étapes pour l'import bulk CSV bénéficiaires — Module 4 B5.
 *
 *   Step 1 : upload CSV + template download
 *   Step 2 : preview + validation Zod par ligne (pas de pré-check email
 *            intra-org en V1 — le RPC retourne les skips en WARNING)
 *   Step 3 : résultat (created / skipped / errors)
 *
 * Pas de rollback total : si une row a un email existant, le RPC SKIP avec
 * WARNING (sans rollback). Cohérent avec bulk_create_beneficiaries (différent
 * de bulk_create_awards qui rollback).
 */
export function BulkImportBeneficiariesModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) dispatch({ type: 'reset' });
  }, [open]);

  function handleClose() {
    if (pending) return;
    onOpenChange(false);
  }

  function handleLaunch() {
    const validRows = state.parsedRows
      .map((row, i) => ({ row, valid: state.rowValidations[i]?.valid }))
      .filter((x) => x.valid)
      .map((x) => {
        const { __raw: _ignore, ...candidate } = x.row;
        void _ignore;
        return candidate;
      });

    if (validRows.length === 0) {
      toast.error('Aucune ligne valide à importer');
      return;
    }

    startTransition(async () => {
      dispatch({ type: 'goto', step: 3 });
      const res = await bulkCreateBeneficiaries({ rows: validRows });
      if (res.ok) {
        const errors: ImportError[] = (res.errors ?? []).map((e, i) => ({
          rowIndex:
            typeof (e as { rowIndex?: unknown }).rowIndex === 'number'
              ? (e as { rowIndex: number }).rowIndex
              : i,
          email: (e as { email?: string }).email,
          message: (e as { message?: string }).message ?? 'Erreur inconnue',
          severity: (e as { severity?: string }).severity,
        }));
        const skipped = errors.filter((e) => e.severity === 'WARNING').length;
        const realErrors = errors.filter((e) => e.severity !== 'WARNING');
        if (realErrors.length === 0) {
          dispatch({
            type: 'set_result',
            result: { kind: 'success', created: res.created, skipped },
          });
        } else {
          dispatch({
            type: 'set_result',
            result: {
              kind: 'partial',
              created: res.created,
              skipped,
              errors: realErrors,
            },
          });
        }
      } else {
        dispatch({ type: 'set_result', result: { kind: 'error', error: res.error } });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-primary size-5" />
            Import CSV de bénéficiaires
          </DialogTitle>
          <DialogDescription>
            Étape {state.step} / 3 —{' '}
            {state.step === 1
              ? 'Fichier CSV'
              : state.step === 2
                ? 'Preview & validation'
                : 'Résultat'}
          </DialogDescription>
        </DialogHeader>

        {state.step === 1 ? <Step1Upload state={state} dispatch={dispatch} /> : null}
        {state.step === 2 ? <Step2Preview state={state} /> : null}
        {state.step === 3 ? <Step3Result state={state} pending={pending} /> : null}

        <DialogFooter className="flex-row justify-between gap-2">
          {state.step === 1 ? (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={pending}>
                Annuler
              </Button>
              <Button
                onClick={() => dispatch({ type: 'goto', step: 2 })}
                disabled={state.parsedRows.length === 0 || state.parseError !== null || pending}
                data-testid="bulk-bene-next-1"
              >
                Suivant
              </Button>
            </>
          ) : null}

          {state.step === 2 ? (
            <>
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: 'goto', step: 1 })}
                disabled={pending}
              >
                Précédent
              </Button>
              <Step2Footer state={state} onLaunch={handleLaunch} pending={pending} />
            </>
          ) : null}

          {state.step === 3 && !pending ? (
            <Step3Footer
              state={state}
              onClose={() => {
                if (state.result?.kind !== 'error') onSuccess();
                handleClose();
              }}
              onRestart={() => dispatch({ type: 'reset' })}
            />
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Upload CSV
// ---------------------------------------------------------------------------

function Step1Upload({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} MB > 5 MB)`);
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      toast.error('Format invalide — un fichier .csv est requis');
      return;
    }
    const text = await file.text();
    const result = parseBeneficiariesCsv(text);
    if (result.error) {
      dispatch({
        type: 'set_file',
        fileName: file.name,
        fileSize: file.size,
        parsedRows: [],
        validations: [],
        parseError: result.error,
      });
      return;
    }
    if (result.rows.length > MAX_ROWS) {
      dispatch({
        type: 'set_file',
        fileName: file.name,
        fileSize: file.size,
        parsedRows: [],
        validations: [],
        parseError: `Import limité à ${MAX_ROWS} lignes par batch (got ${result.rows.length}). Splitter votre fichier.`,
      });
      return;
    }
    const validations = validateBeneficiaryRows(result.rows);
    dispatch({
      type: 'set_file',
      fileName: file.name,
      fileSize: file.size,
      parsedRows: result.rows,
      validations,
      parseError: null,
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Fichier CSV *</Label>
          <a
            href="/beneficiaries-import-template.csv"
            download
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            data-testid="bulk-bene-download-template"
          >
            <Download className="size-3" />
            Télécharger le template
          </a>
        </div>

        {!state.fileName ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-input bg-muted/20 hover:bg-muted/40 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 transition"
            data-testid="bulk-bene-dropzone"
          >
            <Upload className="text-muted-foreground size-8" />
            <p className="text-sm font-medium">Glisser-déposer un fichier CSV</p>
            <p className="text-muted-foreground text-xs">
              ou cliquer pour parcourir (max 5 MB, 500 lignes)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              data-testid="bulk-bene-file-input"
            />
          </div>
        ) : (
          <div className="bg-muted/20 flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-primary size-5" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{state.fileName}</span>
                <span className="text-muted-foreground text-xs">
                  {state.fileSize ? `${(state.fileSize / 1024).toFixed(1)} KB` : ''} ·{' '}
                  {state.parsedRows.length} ligne{state.parsedRows.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => dispatch({ type: 'clear_file' })}
              data-testid="bulk-bene-clear-file"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {state.parseError ? (
          <div className="bg-destructive/10 text-destructive border-destructive/20 flex items-start gap-2 rounded-md border p-2 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{state.parseError}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Preview + validation
// ---------------------------------------------------------------------------

function Step2Preview({ state }: { state: State }) {
  const validCount = state.rowValidations.filter((v) => v.valid).length;
  const invalidCount = state.rowValidations.length - validCount;

  return (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <SummaryCard label="Total" value={state.parsedRows.length.toString()} />
        <SummaryCard label="Valides" value={validCount.toString()} tone="emerald" />
        <SummaryCard
          label="Erreurs"
          value={invalidCount.toString()}
          tone={invalidCount > 0 ? 'destructive' : undefined}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Les bénéficiaires avec un email déjà existant dans l&apos;org seront automatiquement ignorés
        (skip) à l&apos;import — le compteur final sera affiché à l&apos;étape 3.
      </p>

      <div className="overflow-x-auto rounded-md border" data-testid="bulk-bene-preview-table">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-muted-foreground border-b text-left uppercase">
            <tr>
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Email</th>
              <th className="px-2 py-1.5 font-medium">Prénom</th>
              <th className="px-2 py-1.5 font-medium">Nom</th>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Contrat</th>
              <th className="px-2 py-1.5 font-medium">Embauche</th>
              <th className="px-2 py-1.5 font-medium">État</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {state.parsedRows.map((row, idx) => (
              <PreviewRow
                key={idx}
                rowIndex={idx}
                row={row}
                validation={state.rowValidations[idx]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'emerald' | 'destructive';
}) {
  const toneCls =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
      : tone === 'destructive'
        ? 'border-destructive/30 bg-destructive/5 text-destructive'
        : 'border-border bg-muted/20';
  return (
    <div className={`rounded-md border p-2 ${toneCls}`}>
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PreviewRow({
  rowIndex,
  row,
  validation,
}: {
  rowIndex: number;
  row: ParsedBeneficiaryRow;
  validation: RowValidationResult | undefined;
}) {
  const valid = validation?.valid ?? false;
  const errors = validation && !validation.valid ? validation.errors : [];
  const errorMsg = errors.map((e) => `${e.path}: ${e.message}`).join(' · ');

  return (
    <tr
      className={valid ? '' : 'bg-destructive/5'}
      title={errorMsg || undefined}
      data-testid={`bulk-bene-row-${rowIndex}`}
    >
      <td className="px-2 py-1 font-mono text-[11px]">{rowIndex + 1}</td>
      <td className="max-w-[180px] truncate px-2 py-1">{row.email ?? '—'}</td>
      <td className="px-2 py-1">{row.firstName ?? '—'}</td>
      <td className="px-2 py-1">{row.lastName ?? '—'}</td>
      <td className="px-2 py-1">{row.beneficiaryType ?? '—'}</td>
      <td className="px-2 py-1">{row.contractType ?? '—'}</td>
      <td className="px-2 py-1 font-mono">{row.hireDate ?? '—'}</td>
      <td className="px-2 py-1">
        {valid ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3" />
            OK
          </span>
        ) : (
          <span
            className="bg-destructive/15 text-destructive inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
            data-testid={`bulk-bene-row-error-${rowIndex}`}
          >
            <AlertTriangle className="size-3" />
            Erreur
          </span>
        )}
      </td>
    </tr>
  );
}

function Step2Footer({
  state,
  onLaunch,
  pending,
}: {
  state: State;
  onLaunch: () => void;
  pending: boolean;
}) {
  const validCount = state.rowValidations.filter((v) => v.valid).length;
  const invalidCount = state.rowValidations.length - validCount;
  const cantLaunch = invalidCount > 0 || validCount === 0;

  function onClick() {
    if (validCount > 50) {
      const ok = window.confirm(
        `Importer ${validCount} bénéficiaires ? Les emails déjà existants dans l'org seront ignorés.`,
      );
      if (!ok) return;
    }
    onLaunch();
  }

  return (
    <Button
      onClick={onClick}
      disabled={cantLaunch || pending}
      data-testid="bulk-bene-launch"
      title={
        invalidCount > 0
          ? 'Corriger les erreurs avant de lancer'
          : validCount === 0
            ? 'Aucune ligne valide'
            : undefined
      }
    >
      Lancer l&apos;import ({validCount})
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Result
// ---------------------------------------------------------------------------

function Step3Result({ state, pending }: { state: State; pending: boolean }) {
  if (pending || !state.result) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="text-primary size-8 animate-spin" />
        <p className="text-sm font-medium">Import en cours, ne fermez pas cette fenêtre…</p>
      </div>
    );
  }

  if (state.result.kind === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <CheckCircle2 className="size-12 text-emerald-600" />
        <p className="text-base font-semibold">
          ✓ Import réussi : {state.result.created} bénéficiaire
          {state.result.created > 1 ? 's' : ''} créé{state.result.created > 1 ? 's' : ''}
        </p>
        {state.result.skipped > 0 ? (
          <p className="text-muted-foreground text-xs">
            {state.result.skipped} ligne{state.result.skipped > 1 ? 's' : ''} ignorée
            {state.result.skipped > 1 ? 's' : ''} (email déjà existant dans l&apos;org)
          </p>
        ) : null}
      </div>
    );
  }

  if (state.result.kind === 'partial') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <AlertTriangle className="size-12 text-amber-500" />
        <p className="text-base font-semibold">
          Import partiel : {state.result.created} créés
          {state.result.skipped > 0 ? `, ${state.result.skipped} ignorés` : ''},{' '}
          {state.result.errors.length} erreur{state.result.errors.length > 1 ? 's' : ''}
        </p>
        <ul className="bg-muted/20 max-h-48 w-full space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
          {state.result.errors.map((err, i) => (
            <li key={`${err.rowIndex}-${i}`}>
              <span className="font-medium">Ligne {err.rowIndex + 1}</span>
              {err.email ? ` (${err.email})` : ''} : {err.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <XCircle className="text-destructive size-12" />
      <p className="text-base font-semibold">Échec de l&apos;import</p>
      <p className="bg-destructive/10 text-destructive border-destructive/20 max-w-md rounded-md border p-2 text-center text-xs">
        {state.result.error}
      </p>
      <p className="text-muted-foreground text-xs">Aucun bénéficiaire n&apos;a été créé.</p>
    </div>
  );
}

function Step3Footer({
  state,
  onClose,
  onRestart,
}: {
  state: State;
  onClose: () => void;
  onRestart: () => void;
}) {
  if (!state.result) return null;
  if (state.result.kind === 'error') {
    return (
      <>
        <Button variant="ghost" onClick={onClose} data-testid="bulk-bene-close">
          Fermer
        </Button>
        <Button onClick={onRestart} data-testid="bulk-bene-restart">
          Recommencer
        </Button>
      </>
    );
  }
  return (
    <Button onClick={onClose} data-testid="bulk-bene-close">
      Fermer et voir les bénéficiaires
    </Button>
  );
}
