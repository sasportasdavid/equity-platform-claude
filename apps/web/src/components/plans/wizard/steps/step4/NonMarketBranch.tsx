'use client';

import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  COMPARISON_OPERATOR_UI_LABELS,
  ComparisonOperatorEnum,
  NON_MARKET_METRIC_DEFAULT_UNITS,
  NON_MARKET_METRIC_UI_LABELS,
  NonMarketMetricEnum,
  PERFORMANCE_THRESHOLD_LIMITS,
  PLAN_WIZARD_LIMITS,
  type NonMarketMetric,
  type PerformanceConditionInput,
  type PlanWizardData,
} from '@equity/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * MODULE_03A_PLANS Step 4.2 — branche NON_MARKET d'une condition.
 *
 * Champs :
 *  - `metric` (9 options) : EBITDA / REVENUE / NET_INCOME / USERS / ARR /
 *    NPS / ESG_SCORE / CARBON / CUSTOM
 *  - `comparisonOperator` (6 options) : ≥ / ≤ / > / < / = / ≠
 *  - `targetValue` (texte libre, ≤ 100 chars) — la valeur cible
 *  - `targetUnit` (texte libre) — auto-rempli depuis
 *    {@link NON_MARKET_METRIC_DEFAULT_UNITS} sauf si l'utilisateur a customisé
 *  - `thresholdMin` (0-100 %) — seuil à partir duquel le scoring débute
 *  - `thresholdMax` (0-200 %) — seuil à partir duquel le scoring est plafonné
 *
 * **Auto-mapping metric → targetUnit** :
 * Quand l'utilisateur sélectionne une nouvelle métrique, on pré-remplit
 * `targetUnit` avec l'unité par défaut de la métrique. Mais on ne veut pas
 * écraser une saisie manuelle. Heuristique simple : on remplace l'unité
 * uniquement si elle est *vide* OU si elle vaut le défaut de la métrique
 * précédente (= utilisateur ne l'a jamais touchée). Si l'utilisateur a
 * modifié manuellement (= autre chose que les deux defaults), on laisse.
 *
 * Toutes les validations cross-field (champs requis, bornes seuils,
 * thresholdMin ≤ thresholdMax) sont attachées au schéma global dans
 * `planWizardSchema.superRefine` — le composant se contente d'afficher
 * les messages d'erreur reçus via `formState.errors`.
 *
 * **Tous les `register` utilisent `{ shouldUnregister: true }`** : quand le
 * composant unmount (l'utilisateur change le `conditionType` pour SERVICE
 * ou MARKET), RHF purge automatiquement les valeurs metric / operator /
 * targetValue / etc. de `formState`. Sans ça, les valeurs restent en
 * "shadow state" RHF et reviennent quand l'utilisateur retourne au type
 * NON_MARKET. La purge automatique est complétée par le helper
 * {@link cleanConditionForType} pour les Server Actions / exports.
 */
export function NonMarketBranch({ index }: { index: number }) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  const condition = watch(`conditions.${index}`) as PerformanceConditionInput | undefined;

  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, { message?: string } | undefined>> | undefined
  )?.[index];

  // Auto-mapping metric → targetUnit. On garde la métrique précédente dans
  // un ref pour comparer son default à la valeur courante de targetUnit :
  // si la valeur courante de targetUnit correspond au default de l'ancienne
  // métrique, on considère que l'utilisateur n'a pas touché et on remplace.
  const previousMetricRef = useRef<NonMarketMetric | undefined>(condition?.metric);

  useEffect(() => {
    const currentMetric = condition?.metric;
    const previousMetric = previousMetricRef.current;
    if (!currentMetric || currentMetric === previousMetric) {
      return;
    }
    const currentUnit = (condition?.targetUnit ?? '').trim();
    const previousDefault = previousMetric ? NON_MARKET_METRIC_DEFAULT_UNITS[previousMetric] : '';
    const newDefault = NON_MARKET_METRIC_DEFAULT_UNITS[currentMetric];

    // Replace si vide OU si == default précédent (= utilisateur n'a pas touché)
    if (currentUnit === '' || currentUnit === previousDefault) {
      setValue(`conditions.${index}.targetUnit`, newDefault, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
    previousMetricRef.current = currentMetric;
  }, [condition?.metric, condition?.targetUnit, index, setValue]);

  if (!condition) return null;

  return (
    <div
      className="space-y-4 rounded-md border border-dashed p-3"
      data-testid={`non-market-branch-${index}`}
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Conditions non-marché
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-metric`}>Métrique *</Label>
          <select
            id={`cond-${index}-metric`}
            className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
            aria-invalid={!!conditionErrors?.metric}
            {...register(`conditions.${index}.metric`, { shouldUnregister: true })}
            defaultValue={condition.metric ?? ''}
          >
            <option value="">— Sélectionner une métrique —</option>
            {NonMarketMetricEnum.options.map((m) => (
              <option key={m} value={m}>
                {NON_MARKET_METRIC_UI_LABELS[m]}
              </option>
            ))}
          </select>
          {conditionErrors?.metric?.message ? (
            <p className="text-destructive text-xs">{String(conditionErrors.metric.message)}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-operator`}>Opérateur *</Label>
          <select
            id={`cond-${index}-operator`}
            className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
            aria-invalid={!!conditionErrors?.comparisonOperator}
            {...register(`conditions.${index}.comparisonOperator`, { shouldUnregister: true })}
            defaultValue={condition.comparisonOperator ?? ''}
          >
            <option value="">— Sélectionner un opérateur —</option>
            {ComparisonOperatorEnum.options.map((op) => (
              <option key={op} value={op}>
                {COMPARISON_OPERATOR_UI_LABELS[op]}
              </option>
            ))}
          </select>
          {conditionErrors?.comparisonOperator?.message ? (
            <p className="text-destructive text-xs">
              {String(conditionErrors.comparisonOperator.message)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-target-value`}>Valeur cible *</Label>
          <Input
            id={`cond-${index}-target-value`}
            type="text"
            placeholder="Ex : 50000000 ou 50 M€ ou 60"
            maxLength={PLAN_WIZARD_LIMITS.MAX_TARGET_VALUE_LENGTH}
            aria-invalid={!!conditionErrors?.targetValue}
            {...register(`conditions.${index}.targetValue`, { shouldUnregister: true })}
          />
          {conditionErrors?.targetValue?.message ? (
            <p className="text-destructive text-xs">
              {String(conditionErrors.targetValue.message)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Texte libre — vous pouvez écrire « 50 M€ », « 50000000 » ou « 60 ».
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-target-unit`}>Unité</Label>
          <Input
            id={`cond-${index}-target-unit`}
            type="text"
            placeholder={
              condition.metric ? NON_MARKET_METRIC_DEFAULT_UNITS[condition.metric] || 'libre' : '—'
            }
            aria-invalid={!!conditionErrors?.targetUnit}
            {...register(`conditions.${index}.targetUnit`, { shouldUnregister: true })}
          />
          {conditionErrors?.targetUnit?.message ? (
            <p className="text-destructive text-xs">{String(conditionErrors.targetUnit.message)}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {condition.metric === 'USERS' || condition.metric === 'CUSTOM'
                ? 'Saisie obligatoire — pas d’unité par défaut.'
                : 'Auto-remplie selon la métrique. Modifiable.'}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-threshold-min`}>
            Seuil min ({PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_LOWER}–
            {PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_UPPER} %)
          </Label>
          <Input
            id={`cond-${index}-threshold-min`}
            type="number"
            inputMode="decimal"
            min={PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_LOWER}
            max={PERFORMANCE_THRESHOLD_LIMITS.MIN_PCT_UPPER}
            step="any"
            placeholder="Ex : 50"
            aria-invalid={!!conditionErrors?.thresholdMin}
            {...register(`conditions.${index}.thresholdMin`, { shouldUnregister: true })}
          />
          {conditionErrors?.thresholdMin?.message ? (
            <p className="text-destructive text-xs">
              {String(conditionErrors.thresholdMin.message)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Pourcentage de la cible à partir duquel le scoring commence.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-threshold-max`}>
            Seuil max ({PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_LOWER}–
            {PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_UPPER} %)
          </Label>
          <Input
            id={`cond-${index}-threshold-max`}
            type="number"
            inputMode="decimal"
            min={PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_LOWER}
            max={PERFORMANCE_THRESHOLD_LIMITS.MAX_PCT_UPPER}
            step="any"
            placeholder="Ex : 120"
            aria-invalid={!!conditionErrors?.thresholdMax}
            {...register(`conditions.${index}.thresholdMax`, { shouldUnregister: true })}
          />
          {conditionErrors?.thresholdMax?.message ? (
            <p className="text-destructive text-xs">
              {String(conditionErrors.thresholdMax.message)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Plafond du scoring (au-dessus, on n’augmente plus).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
