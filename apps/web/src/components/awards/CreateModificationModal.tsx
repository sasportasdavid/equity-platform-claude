'use client';

import { useEffect, useReducer, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Calendar,
  Check,
  DollarSign,
  Loader2,
  PlusCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JsonDiffViewer } from '@/components/shared/JsonDiffViewer';
import { createAwardModification } from '@/server/actions/awards';
import { getPoolStatusAction } from './get-pool-status-action';
import type { AwardDetailRow } from '@/server/queries/awards';
import type { CreateModificationInput } from '@equity/shared';

type ModificationType = CreateModificationInput['type'];
type Step = 1 | 2 | 3 | 'submitting' | 'done' | 'error';

type ChangesByType = {
  REPRICING: { exercisePrice: string };
  EXTENSION: { expiryDate: string };
  ACCELERATION: Record<string, never>;
  ADDITIONAL_GRANT: { unitsAdded: string };
  CANCELLATION: { confirmIrreversible: boolean };
};

type State = {
  step: Step;
  type: ModificationType | null;
  changes: Partial<{
    exercisePrice: string;
    expiryDate: string;
    unitsAdded: string;
    confirmIrreversible: boolean;
  }>;
  reason: string;
  effectiveDate: string;
  pool: { remaining: number; allocated: number; poolSize: number } | null;
  result: {
    modificationId: string;
    valuationRunId: string | null;
  } | null;
  error: string | null;
};

type Action =
  | { type: 'reset' }
  | { type: 'select_type'; modType: ModificationType }
  | {
      type: 'set_field';
      key: keyof State['changes'] | 'reason' | 'effectiveDate';
      value: string | boolean;
    }
  | { type: 'set_pool'; pool: State['pool'] }
  | { type: 'goto'; step: Step }
  | { type: 'set_result'; result: NonNullable<State['result']> }
  | { type: 'set_error'; error: string };

const today = () => new Date().toISOString().slice(0, 10);

const initialState: State = {
  step: 1,
  type: null,
  changes: {},
  reason: '',
  effectiveDate: today(),
  pool: null,
  result: null,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return { ...initialState, effectiveDate: today() };
    case 'select_type':
      // Reset les changes quand on change de type pour éviter
      // qu'un champ d'un autre type traîne et passe la validation Zod.
      return { ...state, type: action.modType, changes: {} };
    case 'set_field':
      if (action.key === 'reason') return { ...state, reason: String(action.value) };
      if (action.key === 'effectiveDate') return { ...state, effectiveDate: String(action.value) };
      return { ...state, changes: { ...state.changes, [action.key]: action.value } };
    case 'set_pool':
      return { ...state, pool: action.pool };
    case 'goto':
      return { ...state, step: action.step };
    case 'set_result':
      return { ...state, result: action.result, step: 'done' };
    case 'set_error':
      return { ...state, error: action.error, step: 'error' };
    default:
      return state;
  }
}

const TYPE_OPTIONS: Array<{
  value: ModificationType;
  label: string;
  description: string;
  Icon: typeof DollarSign;
  tone: 'amber' | 'blue' | 'orange' | 'emerald' | 'destructive';
}> = [
  {
    value: 'REPRICING',
    label: 'Repricing',
    description: 'Changement du prix d’exercice (recalcul Black-Scholes)',
    Icon: DollarSign,
    tone: 'amber',
  },
  {
    value: 'EXTENSION',
    label: 'Extension',
    description: 'Extension de la fenêtre d’exercice (nouvelle expiry_date)',
    Icon: Calendar,
    tone: 'blue',
  },
  {
    value: 'ACCELERATION',
    label: 'Acceleration',
    description: 'Vesting accéléré de toutes les tranches PENDING',
    Icon: Zap,
    tone: 'orange',
  },
  {
    value: 'ADDITIONAL_GRANT',
    label: 'Additional grant',
    description: 'Ajout d’units à l’award (consomme du pool)',
    Icon: PlusCircle,
    tone: 'emerald',
  },
  {
    value: 'CANCELLATION',
    label: 'Cancellation',
    description: 'Annulation post-grant (charge IFRS 2 immédiate)',
    Icon: Ban,
    tone: 'destructive',
  },
];

const TONE_CLASSES: Record<(typeof TYPE_OPTIONS)[number]['tone'], string> = {
  amber:
    'border-amber-500/40 bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300',
  blue: 'border-blue-500/40 bg-blue-50 hover:bg-blue-100 text-blue-900 dark:bg-blue-500/10 dark:text-blue-300',
  orange:
    'border-orange-500/40 bg-orange-50 hover:bg-orange-100 text-orange-900 dark:bg-orange-500/10 dark:text-orange-300',
  emerald:
    'border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300',
  destructive: 'border-destructive/40 bg-destructive/10 hover:bg-destructive/15 text-destructive',
};

/**
 * Modale de création d'une modification IFRS 2.27-28 — Module 3b B6.
 *
 *   Step 1 : sélection du type (5 cards)
 *   Step 2 : formulaire dynamique selon le type
 *   Step 3 : récap before/after (JsonDiffViewer simulé) + confirmation
 *   submitting / done / error : feedback post-soumission
 *
 * La validation Zod côté client (createModificationSchema) gère le mapping
 * type → changes correctement (discriminated union).
 */
export function CreateModificationModal({
  open,
  onOpenChange,
  award,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  award: AwardDetailRow['award'] & { plan_id?: string };
  onSuccess: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pending, startTransition] = useTransition();

  // Reset à la fermeture
  useEffect(() => {
    if (!open) dispatch({ type: 'reset' });
  }, [open]);

  // Pool fetch quand on entre en step 2 et qu'on est en ADDITIONAL_GRANT
  useEffect(() => {
    if (state.step === 2 && state.type === 'ADDITIONAL_GRANT') {
      const planId = award.plan_id;
      if (planId) {
        startTransition(async () => {
          const res = await getPoolStatusAction(planId);
          dispatch({ type: 'set_pool', pool: res });
        });
      }
    }
  }, [state.step, state.type, award.plan_id]);

  function handleClose() {
    if (pending) return;
    onOpenChange(false);
  }

  function buildPayload(): CreateModificationInput | null {
    if (!state.type) return null;
    const common = {
      awardId: award.id,
      reason: state.reason,
      effectiveDate: state.effectiveDate || undefined,
    };
    switch (state.type) {
      case 'REPRICING':
        return {
          ...common,
          type: 'REPRICING',
          changes: { exercisePrice: Number(state.changes.exercisePrice ?? 0) },
        };
      case 'EXTENSION':
        return {
          ...common,
          type: 'EXTENSION',
          changes: { expiryDate: state.changes.expiryDate ?? '' },
        };
      case 'ACCELERATION':
        return { ...common, type: 'ACCELERATION', changes: {} };
      case 'ADDITIONAL_GRANT':
        return {
          ...common,
          type: 'ADDITIONAL_GRANT',
          changes: { unitsAdded: Number(state.changes.unitsAdded ?? 0) },
        };
      case 'CANCELLATION':
        if (state.changes.confirmIrreversible !== true) return null;
        return {
          ...common,
          type: 'CANCELLATION',
          changes: { confirmIrreversible: true },
        };
    }
  }

  function handleConfirm() {
    const payload = buildPayload();
    if (!payload) return;
    dispatch({ type: 'goto', step: 'submitting' });
    startTransition(async () => {
      const res = await createAwardModification(payload);
      if (res.ok) {
        dispatch({
          type: 'set_result',
          result: {
            modificationId: res.modificationId,
            valuationRunId: res.valuationRunId,
          },
        });
        toast.success('Modification IFRS 2 enregistrée');
      } else {
        dispatch({ type: 'set_error', error: res.error });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="text-primary size-5" />
            Modification IFRS 2.27-28
          </DialogTitle>
          <DialogDescription>
            Award #{award.award_number ?? award.id.slice(0, 8)} — Étape{' '}
            {typeof state.step === 'number' ? `${state.step} / 3` : state.step}
          </DialogDescription>
        </DialogHeader>

        {state.step === 1 ? <Step1TypeSelector state={state} dispatch={dispatch} /> : null}
        {state.step === 2 ? (
          <Step2DynamicForm state={state} dispatch={dispatch} award={award} />
        ) : null}
        {state.step === 3 ? <Step3Recap state={state} award={award} /> : null}
        {state.step === 'submitting' ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="text-primary size-8 animate-spin" />
            <p className="text-sm font-medium">Application en cours…</p>
          </div>
        ) : null}
        {state.step === 'done' && state.result ? <DoneScreen result={state.result} /> : null}
        {state.step === 'error' && state.error ? <ErrorScreen error={state.error} /> : null}

        <DialogFooter className="flex-row justify-between gap-2">
          {state.step === 1 ? (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Annuler
              </Button>
              <Button
                onClick={() => dispatch({ type: 'goto', step: 2 })}
                disabled={!state.type}
                data-testid="modif-next-1"
              >
                Suivant
              </Button>
            </>
          ) : null}

          {state.step === 2 ? (
            <>
              <Button variant="ghost" onClick={() => dispatch({ type: 'goto', step: 1 })}>
                Précédent
              </Button>
              <Step2NextButton state={state} onClick={() => dispatch({ type: 'goto', step: 3 })} />
            </>
          ) : null}

          {state.step === 3 ? (
            <>
              <Button variant="ghost" onClick={() => dispatch({ type: 'goto', step: 2 })}>
                Précédent
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={pending}
                data-testid="modif-confirm"
                variant={state.type === 'CANCELLATION' ? 'destructive' : 'default'}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  'Confirmer la modification'
                )}
              </Button>
            </>
          ) : null}

          {state.step === 'done' || state.step === 'error' ? (
            <>
              {state.step === 'error' ? (
                <Button
                  variant="ghost"
                  onClick={() => dispatch({ type: 'goto', step: 1 })}
                  data-testid="modif-restart"
                >
                  Recommencer
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  if (state.step === 'done') onSuccess();
                  handleClose();
                }}
                data-testid="modif-close"
              >
                {state.step === 'done' ? 'Fermer' : 'Fermer'}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Type selector (5 cards)
// ---------------------------------------------------------------------------

function Step1TypeSelector({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {TYPE_OPTIONS.map((opt) => {
          const selected = state.type === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => dispatch({ type: 'select_type', modType: opt.value })}
              className={[
                'flex items-start gap-3 rounded-lg border-2 p-3 text-left transition',
                selected ? 'ring-primary/30 ring-2' : 'border-border bg-card hover:bg-muted/40',
                selected ? TONE_CLASSES[opt.tone] : '',
              ].join(' ')}
              data-testid={`modif-type-${opt.value}`}
            >
              <opt.Icon className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-muted-foreground text-xs">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>
      <div className="bg-muted/40 rounded-md border p-2 text-xs">
        <p className="font-medium">À propos des modifications IFRS 2.27-28</p>
        <p className="text-muted-foreground mt-1">
          Une modification post-grant déclenche un recalcul du fair value incrémental qui
          s&apos;étalera sur la période de vesting restante. Pour CANCELLATION, la charge IFRS 2
          restante est reconnue immédiatement (settlement).
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Dynamic form per type
// ---------------------------------------------------------------------------

function Step2DynamicForm({
  state,
  dispatch,
  award,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
  award: AwardDetailRow['award'];
}) {
  return (
    <div className="space-y-3 py-2">
      {state.type === 'REPRICING' ? (
        <RepricingForm state={state} dispatch={dispatch} award={award} />
      ) : null}
      {state.type === 'EXTENSION' ? (
        <ExtensionForm state={state} dispatch={dispatch} award={award} />
      ) : null}
      {state.type === 'ACCELERATION' ? <AccelerationForm /> : null}
      {state.type === 'ADDITIONAL_GRANT' ? (
        <AdditionalGrantForm state={state} dispatch={dispatch} />
      ) : null}
      {state.type === 'CANCELLATION' ? (
        <CancellationForm state={state} dispatch={dispatch} />
      ) : null}

      {/* Common fields : date d'effet + reason (sauf CANCELLATION qui a son propre layout) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="modif-effective-date">Date d&apos;effet</Label>
          <Input
            id="modif-effective-date"
            type="date"
            value={state.effectiveDate}
            onChange={(e) =>
              dispatch({ type: 'set_field', key: 'effectiveDate', value: e.target.value })
            }
            data-testid="modif-effective-date"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modif-reason">
            Raison * {state.type === 'CANCELLATION' ? '(min 20 caractères)' : '(min 1 caractère)'}
          </Label>
          <Input
            id="modif-reason"
            value={state.reason}
            onChange={(e) => dispatch({ type: 'set_field', key: 'reason', value: e.target.value })}
            placeholder="Ex. Repricing décidé par le board en mai 2026"
            data-testid="modif-reason"
          />
        </div>
      </div>
    </div>
  );
}

function RepricingForm({
  state,
  dispatch,
  award,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
  award: AwardDetailRow['award'];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="modif-strike">Nouveau prix d&apos;exercice (€) *</Label>
      <Input
        id="modif-strike"
        type="number"
        step="0.01"
        min="0"
        value={state.changes.exercisePrice ?? ''}
        onChange={(e) =>
          dispatch({ type: 'set_field', key: 'exercisePrice', value: e.target.value })
        }
        placeholder="2.00"
        data-testid="modif-strike-input"
      />
      <p className="text-muted-foreground text-xs">
        Strike actuel :{' '}
        <span className="font-mono">
          {award.exercise_price != null ? `${Number(award.exercise_price).toFixed(2)} €` : '—'}
        </span>{' '}
        — un nouveau Black-Scholes sera calculé automatiquement.
      </p>
    </div>
  );
}

function ExtensionForm({
  state,
  dispatch,
  award,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
  award: AwardDetailRow['award'];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="modif-expiry">Nouvelle date d&apos;expiration *</Label>
      <Input
        id="modif-expiry"
        type="date"
        value={state.changes.expiryDate ?? ''}
        min={award.expiry_date ?? undefined}
        onChange={(e) => dispatch({ type: 'set_field', key: 'expiryDate', value: e.target.value })}
        data-testid="modif-expiry-input"
      />
      <p className="text-muted-foreground text-xs">
        Expiry actuelle : <span className="font-mono">{award.expiry_date ?? '—'}</span> — la
        nouvelle date doit être strictement postérieure.
      </p>
    </div>
  );
}

function AccelerationForm() {
  return (
    <div className="rounded-md border border-orange-300 bg-orange-50 p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 text-orange-600 dark:text-orange-400" />
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-orange-900 dark:text-orange-300">
            Vesting accéléré (V1 — toutes les tranches PENDING)
          </p>
          <p className="text-orange-800/80 dark:text-orange-200/80">
            Toutes les tranches non encore acquises de cet award seront forcées en statut
            ACCELERATED à la date d&apos;effet ci-dessous. La charge IFRS 2 restante sera reconnue
            immédiatement.
          </p>
          <p className="italic text-orange-800/60 dark:text-orange-200/60">
            (Mode "tranches spécifiques" prévu en V2.)
          </p>
        </div>
      </div>
    </div>
  );
}

function AdditionalGrantForm({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) {
  const units = Number(state.changes.unitsAdded ?? 0);
  const poolAfter = state.pool ? state.pool.remaining - units : null;
  const poolExceeded = poolAfter !== null && poolAfter < 0;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="modif-units">Units supplémentaires *</Label>
        <Input
          id="modif-units"
          type="number"
          min="1"
          step="1"
          value={state.changes.unitsAdded ?? ''}
          onChange={(e) =>
            dispatch({ type: 'set_field', key: 'unitsAdded', value: e.target.value })
          }
          placeholder="100"
          data-testid="modif-units-input"
        />
      </div>
      {state.pool ? (
        <div
          className={[
            'rounded-md border p-2 text-xs',
            poolExceeded
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-border bg-muted/30 text-muted-foreground',
          ].join(' ')}
          data-testid="modif-pool-banner"
        >
          Pool restant après modification :{' '}
          <span className="font-mono font-medium">
            {poolAfter !== null ? poolAfter.toLocaleString('fr-FR') : '—'}
          </span>{' '}
          / {state.pool.poolSize.toLocaleString('fr-FR')}
          {poolExceeded ? <span className="ml-2 font-semibold">⚠ Dépassement</span> : null}
        </div>
      ) : null}
    </>
  );
}

function CancellationForm({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  return (
    <div className="bg-destructive/10 border-destructive/30 space-y-2 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" />
        <div className="space-y-1 text-xs">
          <p className="text-destructive font-semibold">Action irréversible</p>
          <p className="text-destructive/90">
            L&apos;award sera marqué CANCELLED. Les units non-acquises seront perdues. La charge
            IFRS 2 restante sera reconnue immédiatement (settlement modification accelerative).
          </p>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={state.changes.confirmIrreversible === true}
          onChange={(e) =>
            dispatch({ type: 'set_field', key: 'confirmIrreversible', value: e.target.checked })
          }
          data-testid="modif-confirm-irreversible"
          className="mt-0.5"
        />
        <span>
          Je comprends que cette action est <strong>irréversible</strong> et que la raison
          ci-dessous doit être documentée pour l&apos;audit (min 20 caractères).
        </span>
      </label>
    </div>
  );
}

function Step2NextButton({ state, onClick }: { state: State; onClick: () => void }) {
  const valid = isStep2Valid(state);
  return (
    <Button onClick={onClick} disabled={!valid} data-testid="modif-next-2">
      Suivant
    </Button>
  );
}

function isStep2Valid(state: State): boolean {
  if (!state.type) return false;

  // Date d'effet : optionnelle (default today)
  // Reason : min 1 (ou 20 pour CANCELLATION)
  const minReason = state.type === 'CANCELLATION' ? 20 : 1;
  if (state.reason.trim().length < minReason) return false;

  switch (state.type) {
    case 'REPRICING': {
      const v = Number(state.changes.exercisePrice ?? NaN);
      return Number.isFinite(v) && v >= 0;
    }
    case 'EXTENSION':
      return !!state.changes.expiryDate && state.changes.expiryDate.length === 10;
    case 'ACCELERATION':
      return true;
    case 'ADDITIONAL_GRANT': {
      const u = Number(state.changes.unitsAdded ?? NaN);
      return Number.isInteger(u) && u > 0;
    }
    case 'CANCELLATION':
      return state.changes.confirmIrreversible === true;
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Recap (avant / après simulé via merge)
// ---------------------------------------------------------------------------

function Step3Recap({ state, award }: { state: State; award: AwardDetailRow['award'] }) {
  const before = pickAwardSnapshotKeys(award);
  const after = applyChangesPreview(before, state);

  return (
    <div className="space-y-3 py-2">
      <div className="bg-muted/40 rounded-md border p-2 text-xs">
        <p className="font-semibold">{labelForType(state.type)}</p>
        <p className="text-muted-foreground mt-0.5">
          Date d&apos;effet : <span className="font-mono">{state.effectiveDate}</span> · Raison :{' '}
          <span className="italic">{state.reason || '—'}</span>
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium uppercase">
          Diff award (champs impactés)
        </p>
        <JsonDiffViewer before={before} after={after} maxHeight="20rem" />
      </div>
      <div className="rounded-md border border-blue-300 bg-blue-50 p-2 text-xs dark:border-blue-500/30 dark:bg-blue-500/10">
        {state.type === 'CANCELLATION' ? (
          <span>
            <strong>IFRS 2 :</strong> charge restante reconnue immédiatement (montant exact après
            re-valorisation Module 11).
          </span>
        ) : (
          <span>
            <strong>IFRS 2 :</strong> un valuation_run sera créé en QUEUED. Le fair value
            incrémental sera calculé par le moteur Python et visible dans l&apos;onglet valorisation
            (Module 3a B5) dans quelques minutes.
          </span>
        )}
      </div>
    </div>
  );
}

function pickAwardSnapshotKeys(award: AwardDetailRow['award']): Record<string, unknown> {
  // On n'affiche que les champs susceptibles de changer pour rester lisible.
  return {
    status: award.status,
    units_granted: award.units_granted,
    units_vested: award.units_vested,
    units_cancelled: award.units_cancelled,
    units_outstanding: award.units_outstanding,
    exercise_price: award.exercise_price,
    expiry_date: award.expiry_date,
    cancelled_at: award.cancelled_at,
    cancellation_reason: award.cancellation_reason,
    has_modifications: award.has_modifications ?? false,
  };
}

function applyChangesPreview(
  before: Record<string, unknown>,
  state: State,
): Record<string, unknown> {
  if (!state.type) return before;
  const after: Record<string, unknown> = { ...before, has_modifications: true };
  switch (state.type) {
    case 'REPRICING':
      after.exercise_price = Number(state.changes.exercisePrice ?? 0);
      return after;
    case 'EXTENSION':
      after.expiry_date = state.changes.expiryDate ?? null;
      return after;
    case 'ACCELERATION': {
      // Preview : units_vested = units_granted, status = FULLY_VESTED
      const granted = before.units_granted as number;
      after.units_vested = granted;
      after.status = 'FULLY_VESTED';
      return after;
    }
    case 'ADDITIONAL_GRANT': {
      const u = Number(state.changes.unitsAdded ?? 0);
      after.units_granted = (before.units_granted as number) + u;
      // units_outstanding est GENERATED, on l'extrapole pour le preview UI
      const outBefore = (before.units_outstanding as number | null) ?? 0;
      after.units_outstanding = outBefore + u;
      return after;
    }
    case 'CANCELLATION': {
      const out = (before.units_outstanding as number | null) ?? 0;
      const can = (before.units_cancelled as number) ?? 0;
      after.units_cancelled = can + out;
      after.units_outstanding = 0;
      after.status = 'CANCELLED';
      after.cancelled_at = new Date().toISOString();
      after.cancellation_reason = state.reason;
      return after;
    }
  }
}

function labelForType(t: ModificationType | null): string {
  if (!t) return '';
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

// ---------------------------------------------------------------------------
// Done / Error screens
// ---------------------------------------------------------------------------

function DoneScreen({
  result,
}: {
  result: { modificationId: string; valuationRunId: string | null };
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Check className="size-12 text-emerald-600" />
      <p className="text-base font-semibold">Modification enregistrée</p>
      <p className="text-muted-foreground max-w-md text-center text-xs">
        ID modification : <span className="font-mono">{result.modificationId}</span>
      </p>
      {result.valuationRunId ? (
        <p className="text-muted-foreground max-w-md text-center text-xs">
          Valuation run en QUEUED : <span className="font-mono">{result.valuationRunId}</span>
          <br />
          Le fair value incrémental sera calculé en arrière-plan.
        </p>
      ) : null}
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <AlertTriangle className="text-destructive size-12" />
      <p className="text-base font-semibold">Échec de la modification</p>
      <p className="bg-destructive/10 text-destructive border-destructive/20 max-w-md rounded-md border p-2 text-center text-xs">
        {error}
      </p>
    </div>
  );
}

// CardHeader/CardContent/CardTitle imports inlined when needed (we don't use Card here in V1)
void Card;
void CardContent;
void CardHeader;
void CardTitle;
