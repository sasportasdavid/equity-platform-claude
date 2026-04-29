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
import { bulkCreateAwards } from '@/server/actions/awards';
import { getPoolStatusAction } from './get-pool-status-action';
import {
  parseAwardsCsv,
  validateBulkRows,
  type ParsedRow,
  type RowValidationResult,
} from './bulk-import-helpers';
import type { PlanForCreation } from '@/server/queries/awards';

type Step = 1 | 2 | 3;

type ImportResult =
  | { kind: 'success'; created: number; awardIds: string[] }
  | { kind: 'partial'; created: number; errors: { rowIndex: number; error: string }[] }
  | { kind: 'error'; error: string };

type State = {
  step: Step;
  planId: string;
  pool: { remaining: number; allocated: number; poolSize: number } | null;
  fileName: string | null;
  fileSize: number | null;
  parsedRows: ParsedRow[];
  rowValidations: RowValidationResult[];
  parseError: string | null;
  result: ImportResult | null;
};

type Action =
  | { type: 'reset' }
  | { type: 'set_plan'; planId: string }
  | { type: 'set_pool'; pool: State['pool'] }
  | {
      type: 'set_file';
      fileName: string;
      fileSize: number;
      parsedRows: ParsedRow[];
      validations: RowValidationResult[];
      parseError: string | null;
    }
  | { type: 'clear_file' }
  | { type: 'goto'; step: Step }
  | { type: 'set_result'; result: ImportResult };

const initialState: State = {
  step: 1,
  planId: '',
  pool: null,
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
    case 'set_plan':
      return { ...state, planId: action.planId, pool: null };
    case 'set_pool':
      return { ...state, pool: action.pool };
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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 500;

/**
 * Modale wizard 3 étapes pour l'import bulk CSV — Module 3b B5.
 *
 *   Step 1 : sélection plan + upload CSV (drag & drop) + template download
 *   Step 2 : preview + validation Zod par ligne + check pool restant
 *   Step 3 : confirmation + résultat (success / partial / error)
 *
 * Atomicité : le RPC bulk_create_awards rollback total si une row échoue,
 * donc le cas "partial" ne devrait jamais arriver côté serveur — c'est de la
 * défense en profondeur si l'API change un jour.
 *
 * State management : useReducer (plus lisible que 8× useState pour 3 steps
 * avec navigation arrière).
 */
export function BulkImportModal({
  open,
  onOpenChange,
  plans,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: PlanForCreation[];
  onSuccess: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pending, startTransition] = useTransition();

  // Reset à la fermeture
  useEffect(() => {
    if (!open) dispatch({ type: 'reset' });
  }, [open]);

  // Pool fetch on plan change
  useEffect(() => {
    if (!state.planId) return;
    startTransition(async () => {
      const res = await getPoolStatusAction(state.planId);
      dispatch({ type: 'set_pool', pool: res });
    });
  }, [state.planId]);

  function handleClose() {
    if (pending) return;
    onOpenChange(false);
  }

  function handleLaunch() {
    if (!state.planId || state.parsedRows.length === 0) return;
    const validRows = state.parsedRows.filter((_, i) => state.rowValidations[i]?.valid);
    if (validRows.length === 0) {
      toast.error('Aucune ligne valide à importer');
      return;
    }

    startTransition(async () => {
      dispatch({ type: 'goto', step: 3 });
      const res = await bulkCreateAwards({
        planId: state.planId,
        rows: validRows,
      });
      if (res.ok) {
        dispatch({
          type: 'set_result',
          result: { kind: 'success', created: res.created, awardIds: res.awardIds },
        });
      } else {
        dispatch({
          type: 'set_result',
          result: { kind: 'error', error: res.error },
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-primary size-5" />
            Import CSV d&apos;attributions
          </DialogTitle>
          <DialogDescription>
            Étape {state.step} / 3 —{' '}
            {state.step === 1
              ? 'Plan + fichier CSV'
              : state.step === 2
                ? 'Preview & validation'
                : 'Confirmation'}
          </DialogDescription>
        </DialogHeader>

        {state.step === 1 ? <Step1Upload state={state} dispatch={dispatch} plans={plans} /> : null}

        {state.step === 2 ? <Step2Preview state={state} /> : null}

        {state.step === 3 ? (
          <Step3Result state={state} pending={pending} onSuccessNav={onSuccess} />
        ) : null}

        <DialogFooter className="flex-row justify-between gap-2">
          {state.step === 1 ? (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={pending}>
                Annuler
              </Button>
              <Button
                onClick={() => dispatch({ type: 'goto', step: 2 })}
                disabled={
                  !state.planId ||
                  state.parsedRows.length === 0 ||
                  state.parseError !== null ||
                  pending
                }
                data-testid="bulk-import-next-1"
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

          {state.step === 3 ? (
            <Button
              variant="outline"
              onClick={() => {
                if (state.result?.kind === 'success') onSuccess();
                handleClose();
              }}
              disabled={pending}
            >
              Fermer
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Plan select + CSV upload
// ---------------------------------------------------------------------------

function Step1Upload({
  state,
  dispatch,
  plans,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
  plans: PlanForCreation[];
}) {
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
    const result = parseAwardsCsv(text);
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
    const validations = validateBulkRows(result.rows);
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
        <Label htmlFor="bulk-import-plan">Plan cible *</Label>
        <select
          id="bulk-import-plan"
          value={state.planId}
          onChange={(e) => dispatch({ type: 'set_plan', planId: e.target.value })}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          data-testid="bulk-import-plan-select"
        >
          <option value="">— Sélectionner un plan —</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.plan_type}) — pool restant : {p.pool_remaining.toLocaleString('fr-FR')}
            </option>
          ))}
        </select>
        {state.pool ? (
          <p className="text-muted-foreground text-xs">
            Pool restant pour ce plan :{' '}
            <span className="font-mono font-medium">
              {state.pool.remaining.toLocaleString('fr-FR')} /{' '}
              {state.pool.poolSize.toLocaleString('fr-FR')}
            </span>{' '}
            unités
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Fichier CSV *</Label>
          <a
            href="/awards-import-template.csv"
            download
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            data-testid="bulk-import-download-template"
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
            data-testid="bulk-import-dropzone"
          >
            <Upload className="text-muted-foreground size-8" />
            <p className="text-sm font-medium">Glisser-déposer un fichier CSV</p>
            <p className="text-muted-foreground text-xs">ou cliquer pour parcourir (max 5 MB)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              data-testid="bulk-import-file-input"
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
              data-testid="bulk-import-clear-file"
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
// Step 2 — Preview + validation (placeholder, contenu en step 3 commit)
// ---------------------------------------------------------------------------

function Step2Preview({ state }: { state: State }) {
  return <div className="text-muted-foreground py-8 text-center text-sm">Step 2 (à venir)</div>;
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
  return (
    <Button onClick={onLaunch} disabled={pending} data-testid="bulk-import-launch">
      Lancer l&apos;import
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Result (placeholder, contenu en step 4 commit)
// ---------------------------------------------------------------------------

function Step3Result({
  state,
  pending,
  onSuccessNav,
}: {
  state: State;
  pending: boolean;
  onSuccessNav: () => void;
}) {
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
          ✓ Import réussi : {state.result.created} attribution{state.result.created > 1 ? 's' : ''}{' '}
          créée{state.result.created > 1 ? 's' : ''} en DRAFT
        </p>
        <p className="text-muted-foreground text-xs">
          Les awards apparaîtront dans la liste après fermeture de cette modale.
        </p>
      </div>
    );
  }

  if (state.result.kind === 'partial') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <AlertTriangle className="size-12 text-amber-500" />
        <p className="text-base font-semibold">
          Import partiel : {state.result.created} créés, {state.result.errors.length} erreurs
        </p>
        <ul className="bg-muted/20 max-h-48 w-full space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
          {state.result.errors.map((err) => (
            <li key={err.rowIndex}>
              <span className="font-medium">Ligne {err.rowIndex + 1}</span> : {err.error}
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
    </div>
  );
}
