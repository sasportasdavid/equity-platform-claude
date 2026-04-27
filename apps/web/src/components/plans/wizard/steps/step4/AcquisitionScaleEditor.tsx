'use client';

import { useFormContext } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import {
  PLAN_WIZARD_LIMITS,
  type AcquisitionScale,
  type PerformanceConditionInput,
  type PlanWizardData,
} from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AcquisitionScaleChart } from './AcquisitionScaleChart';

/**
 * MODULE_03A_PLANS Step 4.9 — éditeur d'échelle d'acquisition (mode CURVE).
 *
 * Permet de définir une courbe continue de scoring : pour chaque point
 * `(threshold, acquisition)`, le moteur Monte Carlo applique l'acquisition
 * correspondante quand la performance atteint le threshold. Entre 2
 * points consécutifs, l'acquisition est interpolée linéairement.
 *
 * Mode TIERS (paliers discrets, livré au commit 4.10) : chaque palier
 * `[min, max]` mappe sur une `acquisition` constante. Aux frontières,
 * l'acquisition saute (pas d'interpolation). Les tiers doivent être
 * triés par `min` croissant et non chevauchants.
 *
 * Aperçu live via {@link AcquisitionScaleChart} (Recharts) : ligne
 * linéaire pour CURVE, escalier `stepAfter` pour TIERS.
 *
 * Validations cross-field dans `planWizardSchema.superRefine` :
 *  - Mode CURVE : ≥ 2 points
 *  - Thresholds strictement croissants
 *  - Bornes : threshold ∈ [0, 300] %, acquisition ∈ [0, 200] %
 *
 * Échelle optionnelle : si `acquisitionScale` reste `undefined`, le
 * scoring est binaire (0 ou 100 %). Activable via le bouton « Activer
 * une échelle d'acquisition ».
 */

function blankPoint(threshold: number = 0, acquisition: number = 0) {
  // Les points de courbe n'ont pas d'identifiant stable (l'index suffit
  // pour le key React car les points sont strictement ordonnés par
  // threshold croissant — un swap n'est pas attendu en pratique).
  return { threshold, acquisition, label: '' };
}

export function AcquisitionScaleEditor({ index }: { index: number }) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  // Register déclaratif pour shouldUnregister au switch de conditionType.
  // L'échelle est valable pour MARKET et NON_MARKET, pas SERVICE — le
  // wrapper côté ConditionEditor ne montera ce composant que pour les
  // types pertinents.
  register(`conditions.${index}.acquisitionScale`, { shouldUnregister: true });

  const condition = watch(`conditions.${index}`) as PerformanceConditionInput | undefined;
  const scale = condition?.acquisitionScale;

  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, unknown> | undefined> | undefined
  )?.[index];
  const scaleError = conditionErrors?.acquisitionScale as
    | {
        message?: string;
        points?: { message?: string; [k: number]: PointError | undefined };
        tiers?: { message?: string; [k: number]: TierError | undefined };
      }
    | undefined;

  function activate() {
    const initial: AcquisitionScale = {
      mode: 'CURVE',
      points: [blankPoint(0, 0), blankPoint(100, 100)],
    };
    setValue(`conditions.${index}.acquisitionScale`, initial, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function deactivate() {
    setValue(`conditions.${index}.acquisitionScale`, undefined, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  if (!scale) {
    return (
      <div
        className="space-y-2 rounded-md border border-dashed p-3"
        data-testid={`acquisition-scale-${index}`}
      >
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Échelle d’acquisition (optionnelle)
        </p>
        <p className="text-muted-foreground text-xs">
          Sans échelle, le scoring est binaire : 0 % si la cible n’est pas atteinte, 100 % sinon.
          Une échelle permet une acquisition graduée selon la performance.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={activate}
          data-testid={`acquisition-scale-activate-${index}`}
        >
          <Plus className="size-4" /> Activer une échelle d’acquisition
        </Button>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 rounded-md border border-dashed p-3"
      data-testid={`acquisition-scale-${index}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Échelle d’acquisition
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={deactivate}
          aria-label="Désactiver l’échelle d’acquisition"
        >
          <Trash2 className="text-destructive size-4" /> Désactiver
        </Button>
      </div>

      {/* Toggle Mode (CURVE / TIERS) */}
      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground text-xs">Mode :</Label>
        <div className="flex gap-1 rounded-md border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => switchMode('CURVE')}
            className={cn(
              'rounded px-3 py-1',
              scale.mode === 'CURVE'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
            data-testid={`acquisition-mode-curve-${index}`}
            data-active={scale.mode === 'CURVE'}
          >
            Courbe (CURVE)
          </button>
          <button
            type="button"
            onClick={() => switchMode('TIERS')}
            className={cn(
              'rounded px-3 py-1',
              scale.mode === 'TIERS'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
            data-testid={`acquisition-mode-tiers-${index}`}
            data-active={scale.mode === 'TIERS'}
          >
            Paliers (TIERS)
          </button>
        </div>
      </div>

      {scale.mode === 'CURVE' ? (
        <CurvePointsTable
          index={index}
          scale={scale}
          error={scaleError?.points}
          onChange={(nextPoints) =>
            setValue(
              `conditions.${index}.acquisitionScale`,
              { mode: 'CURVE', points: nextPoints },
              { shouldValidate: true, shouldDirty: true },
            )
          }
        />
      ) : (
        <TiersTable
          index={index}
          scale={scale}
          error={scaleError?.tiers}
          onChange={(nextTiers) =>
            setValue(
              `conditions.${index}.acquisitionScale`,
              { mode: 'TIERS', tiers: nextTiers },
              { shouldValidate: true, shouldDirty: true },
            )
          }
        />
      )}

      {scaleError?.message ? (
        <p className="text-destructive text-xs">{String(scaleError.message)}</p>
      ) : null}

      <AcquisitionScaleChart scale={scale} />
    </div>
  );

  function switchMode(next: 'CURVE' | 'TIERS') {
    const current = scale;
    if (!current || next === current.mode) return;
    setValue(`conditions.${index}.acquisitionScale`, convertScaleMode(current, next), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }
}

/**
 * Conversion entre modes en préservant au mieux les données.
 * CURVE → TIERS : crée un palier par paire de points consécutifs.
 * TIERS → CURVE : crée 2 points par palier (début + fin).
 * Si la conversion ne donne pas assez de points/paliers (< 2), on
 * tombe sur un défaut sain (0/0 → 100/100 ou [0-100]/[100-200]).
 */
function convertScaleMode(scale: AcquisitionScale, next: 'CURVE' | 'TIERS'): AcquisitionScale {
  if (next === 'CURVE' && scale.mode === 'TIERS') {
    const points = scale.tiers.flatMap((t) => [
      { threshold: t.min, acquisition: t.acquisition },
      { threshold: t.max, acquisition: t.acquisition },
    ]);
    return {
      mode: 'CURVE',
      points: points.length >= 2 ? points : [blankPoint(0, 0), blankPoint(100, 100)],
    };
  }
  if (next === 'TIERS' && scale.mode === 'CURVE') {
    const tiers: Array<{ min: number; max: number; acquisition: number; label?: string }> = [];
    for (let i = 0; i < scale.points.length - 1; i++) {
      const p = scale.points[i];
      const n = scale.points[i + 1];
      if (p && n) {
        tiers.push({ min: p.threshold, max: n.threshold, acquisition: p.acquisition });
      }
    }
    return {
      mode: 'TIERS',
      tiers:
        tiers.length >= 2
          ? tiers
          : [
              { min: 0, max: 100, acquisition: 0 },
              { min: 100, max: 200, acquisition: 100 },
            ],
    };
  }
  return scale;
}

type PointError = {
  threshold?: { message?: string };
  acquisition?: { message?: string };
};

function CurvePointsTable({
  index,
  scale,
  error,
  onChange,
}: {
  index: number;
  scale: Extract<AcquisitionScale, { mode: 'CURVE' }>;
  error: { message?: string; [k: number]: PointError | undefined } | undefined;
  onChange: (nextPoints: Extract<AcquisitionScale, { mode: 'CURVE' }>['points']) => void;
}) {
  const points = scale.points;
  const atLimit = points.length >= PLAN_WIZARD_LIMITS.MAX_CURVE_POINTS;

  function addPoint() {
    if (atLimit) return;
    // Nouveau point : threshold +25 par rapport au dernier (cap 300),
    // acquisition à 100 par défaut.
    const last = points[points.length - 1];
    const nextThreshold = last ? Math.min(last.threshold + 25, 300) : 0;
    onChange([...points, blankPoint(nextThreshold, 100)]);
  }

  function removePoint(pIdx: number) {
    onChange(points.filter((_, i) => i !== pIdx));
  }

  function updatePoint(
    pIdx: number,
    patch: Partial<{ threshold: number; acquisition: number; label: string }>,
  ) {
    onChange(points.map((p, i) => (i === pIdx ? { ...p, ...patch } : p)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">
          Points de la courbe ({points.length} / {PLAN_WIZARD_LIMITS.MAX_CURVE_POINTS})
        </Label>
        {error?.message ? (
          <p className="text-destructive text-xs">{String(error.message)}</p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="w-10 px-2 py-1.5 text-left font-medium">#</th>
              <th className="px-2 py-1.5 text-left font-medium">
                Threshold (%) <span className="font-normal">[0–300]</span>
              </th>
              <th className="px-2 py-1.5 text-left font-medium">
                Acquisition (%) <span className="font-normal">[0–200]</span>
              </th>
              <th className="px-2 py-1.5 text-left font-medium">Label (optionnel)</th>
              <th className="w-10 px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, pIdx) => {
              const pErr = error?.[pIdx];
              return (
                <tr key={pIdx} className="border-t">
                  <td className="text-muted-foreground px-2 py-1.5 font-mono text-xs">
                    {pIdx + 1}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={300}
                      step="any"
                      value={p.threshold}
                      onChange={(e) => updatePoint(pIdx, { threshold: Number(e.target.value) })}
                      aria-invalid={!!pErr?.threshold?.message}
                      aria-label={`Threshold du point ${pIdx + 1}`}
                      className="h-7 font-mono"
                    />
                    {pErr?.threshold?.message ? (
                      <p className="text-destructive mt-0.5 text-xs">
                        {String(pErr.threshold.message)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={200}
                      step="any"
                      value={p.acquisition}
                      onChange={(e) => updatePoint(pIdx, { acquisition: Number(e.target.value) })}
                      aria-invalid={!!pErr?.acquisition?.message}
                      aria-label={`Acquisition du point ${pIdx + 1}`}
                      className="h-7 font-mono"
                    />
                    {pErr?.acquisition?.message ? (
                      <p className="text-destructive mt-0.5 text-xs">
                        {String(pErr.acquisition.message)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="text"
                      value={p.label ?? ''}
                      onChange={(e) => updatePoint(pIdx, { label: e.target.value })}
                      placeholder="Ex : Cible"
                      aria-label={`Label du point ${pIdx + 1}`}
                      className="h-7"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removePoint(pIdx)}
                      aria-label={`Supprimer le point ${pIdx + 1}`}
                    >
                      <Trash2 className="text-destructive size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPoint}
          disabled={atLimit}
          data-testid={`acquisition-curve-add-point-${index}`}
        >
          <Plus className="size-4" /> Ajouter un point
        </Button>
        {atLimit ? (
          <p className="text-muted-foreground text-xs">
            Limite atteinte ({PLAN_WIZARD_LIMITS.MAX_CURVE_POINTS} points max).
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Entre 2 points : interpolation linéaire. Threshold strictement croissant.
          </p>
        )}
      </div>
    </div>
  );
}

type TierError = {
  min?: { message?: string };
  max?: { message?: string };
  acquisition?: { message?: string };
};

const MAX_TIERS = 10;

function TiersTable({
  index,
  scale,
  error,
  onChange,
}: {
  index: number;
  scale: Extract<AcquisitionScale, { mode: 'TIERS' }>;
  error: { message?: string; [k: number]: TierError | undefined } | undefined;
  onChange: (nextTiers: Extract<AcquisitionScale, { mode: 'TIERS' }>['tiers']) => void;
}) {
  const tiers = scale.tiers;
  const atLimit = tiers.length >= MAX_TIERS;

  function addTier() {
    if (atLimit) return;
    const last = tiers[tiers.length - 1];
    const minNext = last ? last.max : 0;
    const maxNext = Math.min(minNext + 25, 300);
    onChange([...tiers, { min: minNext, max: maxNext, acquisition: 100, label: '' }]);
  }

  function removeTier(tIdx: number) {
    onChange(tiers.filter((_, i) => i !== tIdx));
  }

  function updateTier(
    tIdx: number,
    patch: Partial<{ min: number; max: number; acquisition: number; label: string }>,
  ) {
    onChange(tiers.map((t, i) => (i === tIdx ? { ...t, ...patch } : t)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">
          Paliers ({tiers.length} / {MAX_TIERS})
        </Label>
        {error?.message ? (
          <p className="text-destructive text-xs">{String(error.message)}</p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="w-10 px-2 py-1.5 text-left font-medium">#</th>
              <th className="px-2 py-1.5 text-left font-medium">Min (%)</th>
              <th className="px-2 py-1.5 text-left font-medium">Max (%)</th>
              <th className="px-2 py-1.5 text-left font-medium">Acquisition (%)</th>
              <th className="px-2 py-1.5 text-left font-medium">Label</th>
              <th className="w-10 px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, tIdx) => {
              const tErr = error?.[tIdx];
              return (
                <tr key={tIdx} className="border-t">
                  <td className="text-muted-foreground px-2 py-1.5 font-mono text-xs">
                    {tIdx + 1}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={200}
                      step="any"
                      value={t.min}
                      onChange={(e) => updateTier(tIdx, { min: Number(e.target.value) })}
                      aria-invalid={!!tErr?.min?.message}
                      aria-label={`Min du palier ${tIdx + 1}`}
                      className="h-7 font-mono"
                    />
                    {tErr?.min?.message ? (
                      <p className="text-destructive mt-0.5 text-xs">{String(tErr.min.message)}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={300}
                      step="any"
                      value={t.max}
                      onChange={(e) => updateTier(tIdx, { max: Number(e.target.value) })}
                      aria-invalid={!!tErr?.max?.message}
                      aria-label={`Max du palier ${tIdx + 1}`}
                      className="h-7 font-mono"
                    />
                    {tErr?.max?.message ? (
                      <p className="text-destructive mt-0.5 text-xs">{String(tErr.max.message)}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={200}
                      step="any"
                      value={t.acquisition}
                      onChange={(e) => updateTier(tIdx, { acquisition: Number(e.target.value) })}
                      aria-invalid={!!tErr?.acquisition?.message}
                      aria-label={`Acquisition du palier ${tIdx + 1}`}
                      className="h-7 font-mono"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="text"
                      value={t.label ?? ''}
                      onChange={(e) => updateTier(tIdx, { label: e.target.value })}
                      placeholder="Ex : Cible"
                      aria-label={`Label du palier ${tIdx + 1}`}
                      className="h-7"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeTier(tIdx)}
                      aria-label={`Supprimer le palier ${tIdx + 1}`}
                    >
                      <Trash2 className="text-destructive size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTier}
          disabled={atLimit}
          data-testid={`acquisition-tiers-add-${index}`}
        >
          <Plus className="size-4" /> Ajouter un palier
        </Button>
        {atLimit ? (
          <p className="text-muted-foreground text-xs">
            Limite atteinte ({MAX_TIERS} paliers max).
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Paliers contigus (min ≥ max précédent), pas d&apos;interpolation entre paliers.
          </p>
        )}
      </div>
    </div>
  );
}
