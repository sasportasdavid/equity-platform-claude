'use client';

import { useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { CalendarRange, GitBranch, Plus, Target, Trash2, TriangleAlert } from 'lucide-react';
import {
  MIN_ACQUISITION_MONTHS_BY_TYPE,
  PLAN_WIZARD_LIMITS,
  PLAN_TYPE_UI_LABELS,
  type Frequency,
  type PlanWizardData,
  type VestingType,
} from '@equity/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { generateCliffLinearTranches } from '../lib/cliff-linear';
import { VestingModeCard } from '../shared/vesting-mode-card';

/**
 * Step 3 — Vesting (Module 3a §2.5).
 *
 * 3 modes :
 *   - **single** : 1 tranche unique. Champ date.
 *   - **tranches** : N tranches manuelles avec dates + %, table éditable,
 *     contrainte total = 100 % (tolérance 0.01).
 *   - **cliff_linear** : cliffMonths + cliffPercentage + totalMonths +
 *     frequency. Le calendrier est généré automatiquement (tableau preview
 *     live sous le formulaire).
 *
 * Garde-fous :
 *   - Warning soft si totalMonths < MIN_ACQUISITION_MONTHS_BY_TYPE[planType].
 *   - Validation cross-step : singleVestingDate > grantDate (Zod superRefine
 *     sur planWizardSchema).
 *   - Defensive : si planType / grantDate manquent, on affiche des
 *     placeholders au lieu de planter.
 */

const VESTING_MODES: ReadonlyArray<{
  type: VestingType;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  bullets: readonly string[];
}> = [
  {
    type: 'single',
    title: 'Tranche unique',
    subtitle: '100 % à une date donnée. Le plus simple.',
    icon: <Target className="size-5" />,
    bullets: [
      'Une seule date de vesting',
      'Aucun calcul d’échéancier',
      'Adapté aux primes ponctuelles',
    ],
  },
  {
    type: 'tranches',
    title: 'Tranches personnalisées',
    subtitle: 'Vous définissez chaque date et chaque %.',
    icon: <GitBranch className="size-5" />,
    bullets: [
      'N tranches éditables',
      'Total = 100 % obligatoire',
      'Idéal pour reproduire un calendrier sur-mesure',
    ],
  },
  {
    type: 'cliff_linear',
    title: 'Cliff + linéaire',
    subtitle: 'Standard startup : cliff initial puis paliers réguliers.',
    icon: <CalendarRange className="size-5" />,
    bullets: [
      'Cliff configurable (mois + % à acquisition)',
      'Paliers monthly / quarterly / annually',
      'Calendrier auto-généré',
    ],
  },
];

export function Step3Vesting() {
  const { watch, setValue, formState } = useFormContext<PlanWizardData>();
  const errors = formState.errors;

  const planType = watch('planType');
  const grantDate = watch('grantDate');
  const vestingType = watch('vestingType');
  const totalMonths = watch('totalMonths');

  // Warning soft : durée min recommandée selon plan type
  const minAcquisitionMonths = planType ? MIN_ACQUISITION_MONTHS_BY_TYPE[planType] : 0;
  const showMinAcquisitionWarning =
    vestingType === 'cliff_linear' &&
    minAcquisitionMonths > 0 &&
    totalMonths != null &&
    totalMonths < minAcquisitionMonths;

  function selectMode(mode: VestingType) {
    setValue('vestingType', mode, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <section className="space-y-6" data-testid="step-3-vesting">
      <p className="text-muted-foreground text-sm">
        Choisissez comment les attributions seront acquises dans le temps. Le mode peut être modifié
        tant que le plan n’est pas verrouillé.
      </p>

      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Mode de vesting">
        {VESTING_MODES.map((mode) => (
          <VestingModeCard
            key={mode.type}
            title={mode.title}
            subtitle={mode.subtitle}
            icon={mode.icon}
            bullets={mode.bullets}
            selected={vestingType === mode.type}
            onSelect={() => selectMode(mode.type)}
            testId={`vesting-mode-${mode.type}`}
          />
        ))}
      </div>

      {/* Warning destructif (pas bloquant) sur durée minimale d'acquisition */}
      {showMinAcquisitionWarning ? (
        <Alert variant="destructive" data-testid="min-acquisition-warning">
          <TriangleAlert className="size-4" />
          <AlertTitle>Durée d’acquisition trop courte</AlertTitle>
          <AlertDescription>
            Pour un <strong>{planType ? PLAN_TYPE_UI_LABELS[planType] : ''}</strong>, la durée
            totale recommandée est d’au moins <strong>{minAcquisitionMonths} mois</strong> (
            {Math.round(minAcquisitionMonths / 12)} an
            {minAcquisitionMonths >= 24 ? 's' : ''}). Vous pouvez continuer, mais le régime fiscal
            de faveur ne s’appliquera probablement pas.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Bloc spécifique par mode */}
      {vestingType === 'single' ? (
        <SingleForm grantDate={grantDate} />
      ) : vestingType === 'tranches' ? (
        <TranchesForm grantDate={grantDate} />
      ) : vestingType === 'cliff_linear' ? (
        <CliffLinearForm grantDate={grantDate} />
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed py-8 text-center text-sm">
          Choisissez un mode pour configurer le calendrier de vesting.
        </p>
      )}

      {/* Erreurs Zod cross-step (notamment cliffMonths >= totalMonths) */}
      {(errors.cliffMonths?.message || errors.singleVestingDate?.message) && (
        <p className="text-destructive text-sm">
          {String(errors.cliffMonths?.message ?? errors.singleVestingDate?.message)}
        </p>
      )}
    </section>
  );
}

// ===========================================================================
// SUB-FORMS
// ===========================================================================

function SingleForm({ grantDate }: { grantDate: string | undefined }) {
  const { register, formState } = useFormContext<PlanWizardData>();
  const errors = formState.errors;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tranche unique</CardTitle>
        <CardDescription>
          {grantDate
            ? `100 % des instruments seront acquis à la date ci-dessous (postérieure au ${formatDateFr(grantDate)}).`
            : 'Renseignez d’abord la date d’attribution à l’étape 2.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="single-vesting-date">Date de vesting *</Label>
          <Input
            id="single-vesting-date"
            type="date"
            min={grantDate}
            aria-invalid={!!errors.singleVestingDate}
            {...register('singleVestingDate')}
          />
          {errors.singleVestingDate?.message ? (
            <p className="text-destructive text-xs">{String(errors.singleVestingDate.message)}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tranches manuelles
// ---------------------------------------------------------------------------

function TranchesForm({ grantDate }: { grantDate: string | undefined }) {
  const { watch, setValue, formState } = useFormContext<PlanWizardData>();
  const tranches = watch('vestingTranches') ?? [];
  const errors = formState.errors;

  // Initialise avec une ligne vide si on arrive sans rien
  useEffect(() => {
    if ((watch('vestingTranches') ?? []).length === 0) {
      setValue('vestingTranches', [{ vestingDate: grantDate ?? '', percentage: 0 }], {
        shouldDirty: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = tranches.reduce((s, t) => s + (Number(t.percentage) || 0), 0);
  const totalIs100 = Math.abs(total - 100) < 0.01;
  const drift = total - 100;

  function updateTranche(index: number, field: 'vestingDate' | 'percentage', value: string) {
    const next = [...tranches];
    if (!next[index]) return;
    if (field === 'percentage') {
      next[index] = { ...next[index], percentage: value === '' ? 0 : Number(value) };
    } else {
      next[index] = { ...next[index], vestingDate: value };
    }
    setValue('vestingTranches', next, { shouldValidate: true, shouldDirty: true });
  }

  function addTranche() {
    if (tranches.length >= PLAN_WIZARD_LIMITS.MAX_VESTING_TRANCHES) return;
    setValue('vestingTranches', [...tranches, { vestingDate: grantDate ?? '', percentage: 0 }], {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function removeTranche(index: number) {
    if (tranches.length <= 1) return;
    setValue(
      'vestingTranches',
      tranches.filter((_, i) => i !== index),
      { shouldValidate: true, shouldDirty: true },
    );
  }

  function distributeEvenly() {
    if (tranches.length === 0) return;
    const each = 100 / tranches.length;
    setValue(
      'vestingTranches',
      tranches.map((t) => ({ ...t, percentage: each })),
      { shouldValidate: true, shouldDirty: true },
    );
  }

  return (
    <Card data-testid="tranches-form">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>Tranches personnalisées</span>
          <TotalIndicator total={total} ok={totalIs100} drift={drift} />
        </CardTitle>
        <CardDescription>
          {tranches.length} tranche{tranches.length > 1 ? 's' : ''} ·{' '}
          {totalIs100 ? (
            <span className="text-emerald-600 dark:text-emerald-400">Total ✓</span>
          ) : (
            <span className="text-destructive">
              Total = {total.toFixed(2)} % ({drift >= 0 ? '+' : ''}
              {drift.toFixed(2)} % d’écart)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Date de vesting</TableHead>
                <TableHead className="w-32 text-right">% acquis</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tranches.map((tranche, idx) => {
                const trancheError = errors.vestingTranches?.[idx];
                return (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        min={grantDate}
                        value={tranche.vestingDate ?? ''}
                        onChange={(e) => updateTranche(idx, 'vestingDate', e.target.value)}
                        aria-invalid={
                          !!(trancheError as { vestingDate?: { message?: string } })?.vestingDate
                        }
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        max={100}
                        value={tranche.percentage ?? 0}
                        onChange={(e) => updateTranche(idx, 'percentage', e.target.value)}
                        className="h-8 text-right font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Supprimer la tranche"
                        disabled={tranches.length <= 1}
                        onClick={() => removeTranche(idx)}
                      >
                        <Trash2 className="text-destructive size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTranche}
            disabled={tranches.length >= PLAN_WIZARD_LIMITS.MAX_VESTING_TRANCHES}
          >
            <Plus className="size-4" />
            Ajouter une tranche
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={distributeEvenly}>
            Répartir équitablement
          </Button>
          <span className="text-muted-foreground ml-auto text-xs">
            Max {PLAN_WIZARD_LIMITS.MAX_VESTING_TRANCHES} tranches.
          </span>
        </div>

        {/* Erreur Zod array-level (somme ≠ 100) */}
        {errors.vestingTranches?.message ? (
          <p className="text-destructive text-xs">{String(errors.vestingTranches.message)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cliff + linéaire (avec preview live)
// ---------------------------------------------------------------------------

function CliffLinearForm({ grantDate }: { grantDate: string | undefined }) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  const errors = formState.errors;

  const cliffMonths = watch('cliffMonths');
  const cliffPercentage = watch('cliffPercentage');
  const totalMonths = watch('totalMonths');
  const frequency = watch('frequency');

  // Defaults au premier rendu
  useEffect(() => {
    if (cliffMonths == null) setValue('cliffMonths', 12, { shouldDirty: false });
    if (cliffPercentage == null) setValue('cliffPercentage', 25, { shouldDirty: false });
    if (totalMonths == null) setValue('totalMonths', 48, { shouldDirty: false });
    if (frequency == null) setValue('frequency', 'monthly', { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tranches = useMemo(
    () =>
      generateCliffLinearTranches({
        grantDate,
        cliffMonths: Number(cliffMonths ?? 0),
        cliffPercentage: Number(cliffPercentage ?? 0),
        totalMonths: Number(totalMonths ?? 0),
        frequency: (frequency ?? 'monthly') as Frequency,
      }),
    [grantDate, cliffMonths, cliffPercentage, totalMonths, frequency],
  );

  const totalPct = tranches.reduce((s, t) => s + t.percentage, 0);
  const totalIs100 = Math.abs(totalPct - 100) < 0.01;

  return (
    <Card data-testid="cliff-linear-form">
      <CardHeader>
        <CardTitle className="text-base">Cliff + linéaire</CardTitle>
        <CardDescription>
          Le calendrier ci-dessous est recalculé à chaque modification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="cliff-months">Cliff (mois) *</Label>
            <Input
              id="cliff-months"
              type="number"
              inputMode="numeric"
              min={0}
              max={48}
              step={1}
              aria-invalid={!!errors.cliffMonths}
              {...register('cliffMonths', { valueAsNumber: true })}
            />
            <p className="text-muted-foreground text-xs">Durée jusqu’à la 1re acquisition.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliff-percentage">% acquis au cliff *</Label>
            <Input
              id="cliff-percentage"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              aria-invalid={!!errors.cliffPercentage}
              {...register('cliffPercentage', { valueAsNumber: true })}
            />
            <p className="text-muted-foreground text-xs">25 % typique pour 4 ans.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="total-months">Durée totale (mois) *</Label>
            <Input
              id="total-months"
              type="number"
              inputMode="numeric"
              min={12}
              max={120}
              step={1}
              aria-invalid={!!errors.totalMonths}
              {...register('totalMonths', { valueAsNumber: true })}
            />
            <p className="text-muted-foreground text-xs">48 mois (4 ans) standard.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="frequency">Fréquence *</Label>
            <select
              id="frequency"
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
              {...register('frequency')}
            >
              <option value="monthly">Mensuelle</option>
              <option value="quarterly">Trimestrielle</option>
              <option value="annually">Annuelle</option>
            </select>
          </div>
        </div>

        {/* Preview live */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Calendrier généré</p>
            {tranches.length > 0 ? (
              <Badge
                variant="secondary"
                className={cn(
                  'font-mono text-[10px]',
                  !totalIs100 && 'bg-destructive/10 text-destructive',
                )}
              >
                {tranches.length} tranches · {totalPct.toFixed(2)} %
              </Badge>
            ) : null}
          </div>

          {!grantDate ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center text-xs">
              À configurer — renseignez la date d’attribution à l’étape 2 pour voir le calendrier.
            </p>
          ) : tranches.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center text-xs">
              Calendrier indisponible — vérifiez que <code>cliff &lt; durée totale</code>.
            </p>
          ) : (
            <div
              className="max-h-[320px] overflow-y-auto rounded-md border"
              data-testid="cliff-linear-preview"
            >
              <Table>
                <TableHeader className="bg-muted sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">% tranche</TableHead>
                    <TableHead className="text-right">Cumul</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tranches.map((t) => (
                    <TableRow key={t.index} className={t.isCliff ? 'bg-primary/5' : undefined}>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {t.index}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{formatDateFr(t.date)}</span>
                        {t.isCliff ? (
                          <Badge variant="outline" className="ml-2 font-normal">
                            cliff
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {t.percentage.toFixed(2)} %
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {t.cumulative.toFixed(2)} %
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TotalIndicator (badge vert/rouge)
// ---------------------------------------------------------------------------

function TotalIndicator({ total, ok, drift }: { total: number; ok: boolean; drift: number }) {
  return (
    <Badge
      data-testid="tranches-total-indicator"
      data-ok={ok || undefined}
      className={cn(
        'font-mono text-[10px] tabular-nums',
        ok
          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200'
          : 'bg-destructive/10 text-destructive hover:bg-destructive/10',
      )}
    >
      {ok ? '✓ 100 %' : `${total.toFixed(2)} % (${drift >= 0 ? '+' : ''}${drift.toFixed(2)})`}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateFr(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
