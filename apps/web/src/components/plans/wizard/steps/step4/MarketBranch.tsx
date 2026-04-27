'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  COMPARISON_OPERATOR_UI_LABELS,
  ComparisonOperatorEnum,
  MARKET_METRIC_DEFAULT_UNITS,
  MARKET_METRIC_UI_LABELS,
  MARKET_METRICS_AVAILABLE,
  MarketMetricEnum,
  PLAN_WIZARD_LIMITS,
  type MarketMetric,
  type PerformanceConditionInput,
  type PlanWizardData,
} from '@equity/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PeerGroupEditor } from './PeerGroupEditor';
import { YahooIndexSearch } from './YahooIndexSearch';

/**
 * MODULE_03A_PLANS Step 4.4 — branche MARKET (sous-types SHARE_PRICE +
 * TSR_ABS uniquement). TSR_REL_INDEX (commit 4.5) et TSR_REL_PEERS
 * (commit 4.6 + 4.7) restent désactivés et explicités dans le select.
 *
 * Champs livrés :
 *  - `marketMetricType` (4 options dont 2 actives en 4.4)
 *  - `comparisonOperator` (6 options FR partagées avec NON_MARKET)
 *  - `targetValue` (texte libre, ≤ 100 chars)
 *  - `targetUnit` (auto-mappée : € pour SHARE_PRICE, % pour TSR_ABS)
 *  - Auto-calcul `measurementPeriodYears` depuis
 *    `(performanceEndDate - performanceStartDate) / 365.25`. Affiché en
 *    lecture seule (le plan reste maître de la période via le Step 3).
 *
 * Les dates `performanceStartDate` / `performanceEndDate` sont
 * **obligatoires** pour MARKET (validation cross-field dans
 * `planWizardSchema.superRefine`). Elles sont gérées par le bloc
 * partagé du `ConditionEditor`.
 *
 * **Tous les `register` utilisent `{ shouldUnregister: true }`** : quand
 * le composant unmount (l'utilisateur change le `conditionType` pour
 * SERVICE ou NON_MARKET), RHF purge automatiquement les valeurs.
 * Pattern identique à NonMarketBranch — voir le commentaire détaillé
 * dans ce composant pour la rationale.
 */
export function MarketBranch({ index }: { index: number }) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  const condition = watch(`conditions.${index}`) as PerformanceConditionInput | undefined;

  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, { message?: string } | undefined>> | undefined
  )?.[index];

  // Auto-mapping marketMetricType → targetUnit (même heuristique que
  // NonMarketBranch : remplace si vide ou si == default précédent).
  const previousMetricRef = useRef<MarketMetric | undefined>(condition?.marketMetricType);
  useEffect(() => {
    const currentMetric = condition?.marketMetricType;
    const previousMetric = previousMetricRef.current;
    if (!currentMetric || currentMetric === previousMetric) return;
    const currentUnit = (condition?.targetUnit ?? '').trim();
    const previousDefault = previousMetric ? MARKET_METRIC_DEFAULT_UNITS[previousMetric] : '';
    const newDefault = MARKET_METRIC_DEFAULT_UNITS[currentMetric];
    if (currentUnit === '' || currentUnit === previousDefault) {
      setValue(`conditions.${index}.targetUnit`, newDefault, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
    previousMetricRef.current = currentMetric;
  }, [condition?.marketMetricType, condition?.targetUnit, index, setValue]);

  // Auto-calc measurementPeriodYears depuis dates start/end (lecture seule
  // pour l'utilisateur — il agit sur les dates, pas sur la durée).
  //
  // Convention : Julian year (365.25 jours) — standard astronomique aussi
  // utilisé en pratique IFRS 2 / Black-Scholes. La Banker's year (365)
  // donne ~0.07 % de divergence sur 3 ans, négligeable pour le scoring
  // mais peut décaler les Greeks de vol sur les Monte Carlo longs.
  // FIXME(3a-server-action) : à aligner avec la convention exacte
  // attendue par https://equity-gem-quant.fly.dev/compute/multi-tranche.
  // Voir memory/module_3a_todos.md (section convention).
  const measurementYears = useMemo(() => {
    const start = condition?.performanceStartDate;
    const end = condition?.performanceEndDate;
    if (!start || !end) return null;
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    return (endMs - startMs) / (1000 * 60 * 60 * 24 * 365.25);
  }, [condition?.performanceStartDate, condition?.performanceEndDate]);

  // Persist en form state pour que les futures Server Actions / le moteur
  // Monte Carlo n'aient pas à recalculer. On écrit en string pour rester
  // homogène avec le typage Zod du champ (`string().optional()`).
  // Précision : 6 décimales en form state pour le moteur Monte Carlo,
  // l'UI affichera 2 décimales (3.00) pour la lisibilité.
  useEffect(() => {
    const target =
      measurementYears != null && Number.isFinite(measurementYears)
        ? measurementYears.toFixed(6)
        : '';
    const current = condition?.measurementPeriodYears ?? '';
    if (target !== current) {
      setValue(`conditions.${index}.measurementPeriodYears`, target, {
        shouldValidate: false,
        shouldDirty: false,
      });
    }
  }, [measurementYears, condition?.measurementPeriodYears, index, setValue]);

  if (!condition) return null;

  const placeholderForMetric = condition.marketMetricType
    ? MARKET_METRIC_DEFAULT_UNITS[condition.marketMetricType] || 'libre'
    : '—';

  return (
    <div
      className="space-y-4 rounded-md border border-dashed p-3"
      data-testid={`market-branch-${index}`}
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Conditions marché
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-market-metric`}>Métrique marché *</Label>
          <select
            id={`cond-${index}-market-metric`}
            className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
            aria-invalid={!!conditionErrors?.marketMetricType}
            {...register(`conditions.${index}.marketMetricType`, { shouldUnregister: true })}
            defaultValue={condition.marketMetricType ?? ''}
          >
            <option value="">— Sélectionner une métrique —</option>
            {MarketMetricEnum.options.map((m) => {
              const available = MARKET_METRICS_AVAILABLE.has(m);
              return (
                <option key={m} value={m} disabled={!available}>
                  {MARKET_METRIC_UI_LABELS[m]}
                  {available ? '' : ' — à venir (4.7)'}
                </option>
              );
            })}
          </select>
          {conditionErrors?.marketMetricType?.message ? (
            <p className="text-destructive text-xs">
              {String(conditionErrors.marketMetricType.message)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              SHARE_PRICE = prix absolu du sous-jacent. TSR_ABS = TSR absolu sur la période.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-market-operator`}>Opérateur *</Label>
          <select
            id={`cond-${index}-market-operator`}
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
          <Label htmlFor={`cond-${index}-market-target-value`}>Valeur cible *</Label>
          {/* targetValue convention par marketMetricType :
              - SHARE_PRICE       : prix absolu en EUR (ex : 200 = 200 €)
              - TSR_ABS           : pourcentage absolu sans le « % » (ex : 30 = 30 %)
              - TSR_REL_INDEX     : pourcentage absolu, sera converti en spread Base 100
                (commit 4.5)        par le moteur Python (cf. handover V4.2 du moteur)
              - TSR_REL_PEERS     : idem TSR_REL_INDEX
                (commits 4.6/4.7) */}
          <Input
            id={`cond-${index}-market-target-value`}
            type="text"
            placeholder={targetValuePlaceholder(condition.marketMetricType)}
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
              {targetValueHelp(condition.marketMetricType)}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`cond-${index}-market-target-unit`}>Unité</Label>
          <Input
            id={`cond-${index}-market-target-unit`}
            type="text"
            placeholder={placeholderForMetric}
            aria-invalid={!!conditionErrors?.targetUnit}
            {...register(`conditions.${index}.targetUnit`, { shouldUnregister: true })}
          />
          <p className="text-muted-foreground text-xs">
            Auto-remplie selon la métrique. Modifiable.
          </p>
        </div>
      </div>

      {/* Branche TSR_REL_INDEX (commit 4.5) : sélection d'un indice de
          référence via mock auto-fetch des top indices. */}
      {condition.marketMetricType === 'TSR_REL_INDEX' ? <IndexSelector index={index} /> : null}

      {/* Branche TSR_REL_PEERS (commit 4.6, mode flat) : panel de peers
          avec name + ticker. Le mode WEIGHTED arrive en 4.7. */}
      {condition.marketMetricType === 'TSR_REL_PEERS' ? <PeerGroupEditor index={index} /> : null}

      {/* Auto-calc measurementPeriodYears (lecture seule). Hidden input
          synchronise le form state pour les Server Actions ; l'input
          visible reste read-only et n'est pas registered. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Période de mesure (années, calculée)</Label>
          <Input
            type="text"
            value={measurementYears != null ? measurementYears.toFixed(2) : '—'}
            readOnly
            tabIndex={-1}
            className="bg-muted/40 font-mono text-sm"
            data-testid={`market-period-years-${index}`}
          />
          <p className="text-muted-foreground text-xs">
            Auto-calculé depuis les dates de mesure (Début / Fin ci-dessus). Persisté en
            <code className="ml-1 font-mono">measurementPeriodYears</code>.
          </p>
        </div>
      </div>

      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
        ⚠️ Les dates de mesure (« Début mesure » et « Fin mesure » au-dessus) sont obligatoires pour
        les conditions de marché. Elles définissent la fenêtre Monte Carlo.
      </p>
    </div>
  );
}

/**
 * Placeholder + aide contextuels pour `targetValue` selon le sous-type
 * MARKET sélectionné. Sortis en helpers pour que le JSX reste lisible.
 */
function targetValuePlaceholder(metric: MarketMetric | undefined): string {
  switch (metric) {
    case 'TSR_ABS':
      return 'Ex : 30 (= 30 % sur la période)';
    case 'TSR_REL_INDEX':
      return 'Ex : 5 (= +5 pts au-dessus de l’indice)';
    case 'TSR_REL_PEERS':
      return 'Ex : 5 (= +5 pts au-dessus du panel)';
    case 'SHARE_PRICE':
    default:
      return 'Ex : 200 (= 200 € par action)';
  }
}

function targetValueHelp(metric: MarketMetric | undefined): string {
  switch (metric) {
    case 'TSR_ABS':
      return 'TSR exprimé en pourcentage (sans le « % »).';
    case 'TSR_REL_INDEX':
      return 'Spread vs indice en pourcentage. Le moteur Python convertira en Base 100.';
    case 'TSR_REL_PEERS':
      return 'Spread vs panel en pourcentage. Le moteur Python convertira en Base 100.';
    case 'SHARE_PRICE':
    default:
      return 'Prix absolu en euros.';
  }
}

/**
 * Wrapper RHF autour de `YahooIndexSearch`. Branche les 2 champs
 * `referenceIndex` (ticker) et `referenceIndexDisplayName` (nom
 * affichable) ; les deux sont déclarés avec `shouldUnregister: true`
 * pour la même raison que les autres champs MARKET — purge automatique
 * au switch de type ou de marketMetricType.
 */
function IndexSelector({ index }: { index: number }) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  // Register déclaratifs (sans rendre l'input) — RHF a besoin du register
  // pour suivre le champ et le purger via shouldUnregister au unmount.
  // On rend l'UI custom via YahooIndexSearch et on synchronise via setValue.
  register(`conditions.${index}.referenceIndex`, { shouldUnregister: true });
  register(`conditions.${index}.referenceIndexDisplayName`, { shouldUnregister: true });

  const value = (watch(`conditions.${index}.referenceIndex`) as string | undefined) ?? '';
  const displayName =
    (watch(`conditions.${index}.referenceIndexDisplayName`) as string | undefined) ?? '';

  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, { message?: string } | undefined>> | undefined
  )?.[index];

  return (
    <div className="space-y-2">
      <YahooIndexSearch
        value={value}
        displayName={displayName}
        ariaInvalid={!!conditionErrors?.referenceIndex}
        onChange={(ticker, name) => {
          setValue(`conditions.${index}.referenceIndex`, ticker, {
            shouldValidate: true,
            shouldDirty: true,
          });
          setValue(`conditions.${index}.referenceIndexDisplayName`, name, {
            shouldValidate: false,
            shouldDirty: true,
          });
        }}
      />
      {conditionErrors?.referenceIndex?.message ? (
        <p className="text-destructive text-xs">{String(conditionErrors.referenceIndex.message)}</p>
      ) : null}
    </div>
  );
}
