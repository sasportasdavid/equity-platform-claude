'use client';

import { useFormContext } from 'react-hook-form';
import {
  PLAN_WIZARD_LIMITS,
  REFERENCE_PRICE_METHOD_UI_LABELS,
  ReferencePriceMethodEnum,
  type PerformanceConditionInput,
  type PlanWizardData,
  type ReferencePriceMethod,
} from '@equity/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * MODULE_03A_PLANS Step 4.8 — configuration des prix de référence pour
 * les conditions MARKET (V5).
 *
 * Deux côtés indépendants : prix de **début** (à `performanceStartDate`)
 * et prix de **fin** (à `performanceEndDate`). Chaque côté propose 3
 * méthodes :
 *  - SPOT     : cours instantané à la date (pas de champ supplémentaire)
 *  - FIXED    : prix fixé manuellement (input number > 0)
 *  - AVERAGE  : moyenne sur N jours précédant la date (input entier 1–90)
 *
 * Validations cross-field dans `planWizardSchema.superRefine` :
 *  - les 2 méthodes (start + end) sont obligatoires pour MARKET
 *  - FIXED → fixedPrice obligatoire (positif, ≤ MAX_REFERENCE_PRICE)
 *  - AVERAGE → averagingDays obligatoire (entier 1–90)
 *
 * Cleanup : pas de `shouldUnregister: true` — purgerait au unmount step
 * (cf. fix bug step 7 review). Le switch de conditionType est purgé par
 * `cleanConditionForType` au parent. Sub-mode (FIXED → AVERAGE → SPOT)
 * laisse des valeurs orphelines ; acceptable car la Server Action filtre
 * via `cleanConditionForType` côté serveur (défense en profondeur).
 */
export function ReferencePriceConfig({ index }: { index: number }) {
  const { watch } = useFormContext<PlanWizardData>();
  const condition = watch(`conditions.${index}`) as PerformanceConditionInput | undefined;
  const startMethod = condition?.startPriceMethod;
  const endMethod = condition?.endPriceMethod;

  return (
    <div
      className="space-y-3 rounded-md border border-dashed p-3"
      data-testid={`reference-price-config-${index}`}
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Prix de référence (V5)
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SidePanel index={index} side="start" method={startMethod} />
        <SidePanel index={index} side="end" method={endMethod} />
      </div>
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
        Le moteur Monte Carlo utilise ces prix pour calculer le TSR / la performance entre les deux
        dates. SPOT = cours instantané à la date. FIXED = override manuel. AVERAGE = moyenne des N
        jours précédents (lisse les fluctuations sur les fenêtres courtes).
      </p>
    </div>
  );
}

function SidePanel({
  index,
  side,
  method,
}: {
  index: number;
  side: 'start' | 'end';
  method: ReferencePriceMethod | undefined;
}) {
  const { register, formState } = useFormContext<PlanWizardData>();
  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, { message?: string } | undefined>> | undefined
  )?.[index];

  const sideLabel = side === 'start' ? 'Début' : 'Fin';
  const methodPath =
    side === 'start'
      ? `conditions.${index}.startPriceMethod`
      : `conditions.${index}.endPriceMethod`;
  const fixedPath =
    side === 'start' ? `conditions.${index}.startFixedPrice` : `conditions.${index}.endFixedPrice`;
  const daysPath =
    side === 'start'
      ? `conditions.${index}.startAveragingDays`
      : `conditions.${index}.endAveragingDays`;

  const methodErr = conditionErrors?.[side === 'start' ? 'startPriceMethod' : 'endPriceMethod'];
  const fixedErr = conditionErrors?.[side === 'start' ? 'startFixedPrice' : 'endFixedPrice'];
  const daysErr = conditionErrors?.[side === 'start' ? 'startAveragingDays' : 'endAveragingDays'];

  return (
    <div className="bg-muted/20 space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Prix de référence — {sideLabel} *</p>
      <div className="space-y-1.5">
        <Label htmlFor={`${side}-${index}-method`} className="text-xs">
          Méthode
        </Label>
        <select
          id={`${side}-${index}-method`}
          className="border-input bg-background shadow-xs h-8 w-full rounded-md border px-3 text-sm"
          aria-invalid={!!methodErr?.message}
          {...register(methodPath as `conditions.${number}.startPriceMethod`)}
          defaultValue={method ?? ''}
        >
          <option value="">— Choisir —</option>
          {ReferencePriceMethodEnum.options.map((opt) => (
            <option key={opt} value={opt}>
              {REFERENCE_PRICE_METHOD_UI_LABELS[opt]}
            </option>
          ))}
        </select>
        {methodErr?.message ? (
          <p className="text-destructive text-xs">{String(methodErr.message)}</p>
        ) : null}
      </div>

      {method === 'FIXED' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${side}-${index}-fixed-price`} className="text-xs">
            Prix fixé (en €) *
          </Label>
          <Input
            id={`${side}-${index}-fixed-price`}
            type="number"
            inputMode="decimal"
            min={0}
            max={PLAN_WIZARD_LIMITS.MAX_REFERENCE_PRICE}
            step="any"
            placeholder="Ex : 150"
            aria-invalid={!!fixedErr?.message}
            className="h-8 font-mono"
            {...register(fixedPath as `conditions.${number}.startFixedPrice`)}
          />
          {fixedErr?.message ? (
            <p className="text-destructive text-xs">{String(fixedErr.message)}</p>
          ) : null}
        </div>
      ) : null}

      {method === 'AVERAGE' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${side}-${index}-avg-days`} className="text-xs">
            Nombre de jours précédents *
          </Label>
          <Input
            id={`${side}-${index}-avg-days`}
            type="number"
            inputMode="numeric"
            min={PLAN_WIZARD_LIMITS.MIN_AVERAGING_DAYS}
            max={PLAN_WIZARD_LIMITS.MAX_AVERAGING_DAYS}
            step={1}
            placeholder="Ex : 20"
            aria-invalid={!!daysErr?.message}
            className="h-8 font-mono"
            {...register(daysPath as `conditions.${number}.startAveragingDays`)}
          />
          {daysErr?.message ? (
            <p className="text-destructive text-xs">{String(daysErr.message)}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Entre {PLAN_WIZARD_LIMITS.MIN_AVERAGING_DAYS} et{' '}
              {PLAN_WIZARD_LIMITS.MAX_AVERAGING_DAYS} jours.
            </p>
          )}
        </div>
      ) : null}

      {method === 'SPOT' ? (
        <p className="text-muted-foreground text-xs">
          Aucun champ supplémentaire — le cours sera lu à la date {sideLabel.toLowerCase()}.
        </p>
      ) : null}
    </div>
  );
}
