'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import {
  CategoryEnum,
  cleanConditionForType,
  CONDITION_CATEGORY_UI_LABELS,
  CONDITION_TYPE_UI_LABELS,
  ConditionTypeEnum,
  type ConditionType,
  type PerformanceConditionInput,
  type PlanWizardData,
} from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MarketBranch } from './MarketBranch';
import { NonMarketBranch } from './NonMarketBranch';
import { ServiceBranch } from './ServiceBranch';

/**
 * MODULE_03A_PLANS Step 4 — éditeur d'une condition individuelle.
 *
 * **Squelette** livré au commit 4.1 :
 *  - Header collapsible (chevron + titre + résumé + delete)
 *  - Body : nom, catégorie, type, poids, dates de mesure
 *
 * Les sous-formulaires spécifiques au `conditionType` (NON_MARKET / MARKET /
 * SERVICE) seront branchés dans les commits suivants (4.2 / 4.3 / 4.4 …).
 * Pour l'instant, le body affiche un placeholder « À implémenter ».
 *
 * Convention : on travaille sur l'index dans le tableau `conditions` du
 * form parent (RHF) plutôt que via un `useFieldArray` — ça évite la
 * complexité du fieldArray pour un cas où l'ordre n'a pas d'importance.
 */

// Labels FR centralisés dans `@equity/shared` (réutilisés par sandbox + Step 7).
const CONDITION_TYPE_LABELS = CONDITION_TYPE_UI_LABELS;
const CATEGORY_LABELS = CONDITION_CATEGORY_UI_LABELS;

export function ConditionEditor({
  index,
  showWeight,
  onRemove,
}: {
  index: number;
  showWeight: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const { register, watch, formState, getValues, setValue } = useFormContext<PlanWizardData>();
  const condition = watch(`conditions.${index}`) as PerformanceConditionInput | undefined;
  const errors = formState.errors;
  // Index errors are nested ; cast pour navigation simple
  const conditionErrors = (
    errors.conditions as Array<Record<string, { message?: string } | undefined>> | undefined
  )?.[index];

  // Défense en profondeur : quand l'utilisateur change le type d'une
  // condition existante, on rappelle `cleanConditionForType` pour purger
  // tout champ qui aurait survécu au unmount (au cas où un préset injecte
  // des données orphelines, ou si une future branche oublie d'utiliser
  // `shouldUnregister`). En mode UI normal, NonMarketBranch / MarketBranch
  // gèrent leur propre cleanup via `register({ shouldUnregister: true })`,
  // donc cet effet est généralement no-op.
  // On lit via `getValues` pour casser la dépendance circulaire avec
  // `condition` (qui change après setValue).
  const previousTypeRef = useRef<ConditionType | undefined>(condition?.conditionType);
  useEffect(() => {
    const currentType = condition?.conditionType;
    const prev = previousTypeRef.current;
    if (!currentType || currentType === prev) return;
    if (prev) {
      const current = getValues(`conditions.${index}`) as PerformanceConditionInput | undefined;
      if (current) {
        const cleaned = cleanConditionForType(current, currentType);
        setValue(`conditions.${index}`, cleaned, { shouldValidate: true, shouldDirty: true });
      }
    }
    previousTypeRef.current = currentType;
  }, [condition?.conditionType, getValues, index, setValue]);

  if (!condition) return null;

  return (
    <div
      className={cn(
        'border-border bg-card rounded-lg border transition-colors',
        open && 'shadow-sm',
      )}
      data-testid={`condition-editor-${index}`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/30 flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        aria-controls={`condition-body-${index}`}
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">#{index + 1}</span>
          <span className="truncate text-sm font-medium">
            {condition.name?.trim() || (
              <span className="text-muted-foreground italic">Condition sans nom</span>
            )}
          </span>
          <Badge variant="secondary" className="font-normal">
            {CONDITION_TYPE_LABELS[condition.conditionType]}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {CATEGORY_LABELS[condition.category]}
          </Badge>
          {showWeight ? (
            <Badge variant="outline" className="font-mono font-normal">
              {(condition.weight ?? 0).toFixed(0)} %
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Supprimer la condition ${index + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="text-destructive size-4" />
        </Button>
      </button>

      {/* Body */}
      {open ? (
        <div
          id={`condition-body-${index}`}
          className="border-border/60 space-y-4 border-t px-4 py-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`cond-${index}-name`}>Nom *</Label>
              <Input
                id={`cond-${index}-name`}
                placeholder="Ex : TSR vs CAC 40 sur 3 ans"
                aria-invalid={!!conditionErrors?.name}
                {...register(`conditions.${index}.name`)}
              />
              {conditionErrors?.name?.message ? (
                <p className="text-destructive text-xs">{String(conditionErrors.name.message)}</p>
              ) : null}
            </div>

            {showWeight ? (
              <div className="space-y-1.5">
                <Label htmlFor={`cond-${index}-weight`}>Poids (%) *</Label>
                <Input
                  id={`cond-${index}-weight`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="any"
                  aria-invalid={!!conditionErrors?.weight}
                  {...register(`conditions.${index}.weight`, { valueAsNumber: true })}
                />
                {conditionErrors?.weight?.message ? (
                  <p className="text-destructive text-xs">
                    {String(conditionErrors.weight.message)}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Mode WEIGHTED : la somme de toutes les conditions doit valoir 100 %.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`cond-${index}-type`}>Type de condition *</Label>
              <select
                id={`cond-${index}-type`}
                className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                {...register(`conditions.${index}.conditionType`)}
              >
                {ConditionTypeEnum.options.map((t) => (
                  <option key={t} value={t}>
                    {CONDITION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Marché : TSR, cours de bourse. Non-marché : EBITDA, CA, ARR, ESG…
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`cond-${index}-category`}>Catégorie *</Label>
              <select
                id={`cond-${index}-category`}
                className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                {...register(`conditions.${index}.category`)}
              >
                {CategoryEnum.options.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`cond-${index}-start`}>
                Début mesure {condition.conditionType === 'MARKET' ? '*' : ''}
              </Label>
              <Input
                id={`cond-${index}-start`}
                type="date"
                aria-invalid={!!conditionErrors?.performanceStartDate}
                {...register(`conditions.${index}.performanceStartDate`)}
              />
              {conditionErrors?.performanceStartDate?.message ? (
                <p className="text-destructive text-xs">
                  {String(conditionErrors.performanceStartDate.message)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`cond-${index}-end`}>
                Fin mesure {condition.conditionType === 'MARKET' ? '*' : ''}
              </Label>
              <Input
                id={`cond-${index}-end`}
                type="date"
                aria-invalid={!!conditionErrors?.performanceEndDate}
                {...register(`conditions.${index}.performanceEndDate`)}
              />
              {conditionErrors?.performanceEndDate?.message ? (
                <p className="text-destructive text-xs">
                  {String(conditionErrors.performanceEndDate.message)}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Obligatoires pour les conditions de type Marché.
                </p>
              )}
            </div>
          </div>

          {/* Sous-formulaire spécifique au type. NON_MARKET (4.2) et
              SERVICE (4.3) sont livrés ; MARKET reste un placeholder en
              attendant les commits 4.4 → 4.10. */}
          <TypeBranch index={index} type={condition.conditionType} />
        </div>
      ) : null}
    </div>
  );
}

function TypeBranch({ index, type }: { index: number; type: ConditionType }) {
  if (type === 'NON_MARKET') return <NonMarketBranch index={index} />;
  if (type === 'SERVICE') return <ServiceBranch index={index} />;
  return <MarketBranch index={index} />;
}
