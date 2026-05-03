'use client';

import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Sparkles, TrendingUp } from 'lucide-react';
import {
  CombinationTypeEnum,
  EvaluationMomentEnum,
  FailureActionEnum,
  PLAN_WIZARD_LIMITS,
  type CombinationType,
  type EvaluationMoment,
  type FailureAction,
  type PerformanceConditionInput,
  type PlanWizardData,
} from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ConditionEditor } from './step4/ConditionEditor';
import { WeightValidationBanner } from './step4/WeightValidationBanner';

/**
 * Step 4 — Conditions de performance (Module 3a §2.5).
 *
 * Commit 4.1 — squelette :
 *  - Toggle `hasPerformanceConditions` (checkbox shadcn)
 *  - Quand actif : 3 paramètres globaux (combinationType, evaluationMoment,
 *    failureAction) + liste de ConditionEditor avec ajout/suppression.
 *  - WeightValidationBanner affiché si combinationType === 'WEIGHTED'.
 *  - ConditionEditor body est encore squelette ; les sous-formulaires
 *    spécifiques au conditionType viennent dans les commits 4.2 → 4.10.
 */

const COMBINATION_LABELS: Record<CombinationType, string> = {
  AND: 'AND — Toutes les conditions doivent être atteintes',
  OR: 'OR — Au moins une condition doit être atteinte',
  WEIGHTED: 'WEIGHTED — Pondération définie par condition',
};

const EVALUATION_LABELS: Record<EvaluationMoment, string> = {
  END: 'À l’échéance (mesure finale uniquement)',
  CONTINUOUS: 'En continu (suivi sur la période)',
  ANNUAL: 'Annuelle (chaque exercice de la période)',
};

const FAILURE_LABELS: Record<FailureAction, string> = {
  FORFEIT: 'Forfait — Tout perdu en cas d’échec',
  PARTIAL: 'Partiel — Acquisition au prorata du score atteint',
  DEFER: 'Report — Différer l’évaluation à la période suivante',
};

// Fallback compteur pour environnements où crypto.randomUUID()
// n'est pas dispo (très rare). Date.now() est exclu car Next 16
// le détecte comme impur en render component.
let conditionCounter = 0;
function blankCondition(): PerformanceConditionInput {
  let id: string;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    id = crypto.randomUUID();
  } else {
    conditionCounter += 1;
    id = `cond-fallback-${conditionCounter}`;
  }
  return {
    id,
    name: '',
    conditionType: 'NON_MARKET',
    category: 'FINANCIAL',
    weight: 100,
    enablePartialScoring: true,
  };
}

export function Step4Performance() {
  const toggleId = useId();
  const { register, watch, setValue } = useFormContext<PlanWizardData>();

  const hasConditions = watch('hasPerformanceConditions') ?? false;
  const combinationType = watch('combinationType');
  const conditions = watch('conditions') ?? [];

  const showWeightColumn = combinationType === 'WEIGHTED';
  const totalWeight = conditions.reduce((s, c) => s + (c.weight ?? 0), 0);

  function addCondition() {
    if (conditions.length >= PLAN_WIZARD_LIMITS.MAX_CONDITIONS) return;
    const next = [...conditions, blankCondition()];
    setValue('conditions', next, { shouldValidate: true, shouldDirty: true });
  }

  function removeCondition(idx: number) {
    const next = conditions.filter((_, i) => i !== idx);
    setValue('conditions', next, { shouldValidate: true, shouldDirty: true });
  }

  function toggleConditions(checked: boolean) {
    setValue('hasPerformanceConditions', checked, { shouldValidate: true, shouldDirty: true });
    if (checked) {
      // Initialise les globaux avec des defaults raisonnables
      if (!combinationType) setValue('combinationType', 'AND', { shouldDirty: false });
      if (!watch('evaluationMoment')) setValue('evaluationMoment', 'END', { shouldDirty: false });
      if (!watch('failureAction')) setValue('failureAction', 'FORFEIT', { shouldDirty: false });
    }
  }

  return (
    <section className="space-y-6" data-testid="step-4-performance">
      {/* Header éditorial — Étape 13 Design System V1 */}
      <header className="space-y-2">
        <p className="text-overline text-brass-500">ÉTAPE 4 · CONDITIONS DE PERFORMANCE</p>
        <h2 className="text-h2 text-ink-900">
          Subordonnez <span className="serif-italic text-brass-500">l&apos;acquisition</span> à
          l&apos;atteinte d&apos;objectifs
        </h2>
        <div className="bg-brass-500 animate-draw-line mt-2 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-2xl text-sm leading-relaxed">
          Les conditions de performance permettent de soumettre l&apos;acquisition à l&apos;atteinte
          d&apos;objectifs (financiers, marché, ESG…). Elles s&apos;appliquent à toutes les
          attributions émises sous ce plan.
        </p>
      </header>

      {/* Toggle — éditorial */}
      <Card data-testid="toggle-card">
        <CardContent className="flex items-start gap-3 py-4">
          <Checkbox
            id={toggleId}
            checked={hasConditions}
            onCheckedChange={(c) => toggleConditions(c === true)}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-1">
            <Label htmlFor={toggleId} className="text-ink-900 cursor-pointer text-base font-medium">
              Activer les conditions de performance
            </Label>
            <p className="text-ink-500 text-xs leading-relaxed">
              Si désactivé, l&apos;acquisition est soumise uniquement aux dates du calendrier de
              vesting (étape 3) et aux règles de départ (étape 5).
            </p>
          </div>
        </CardContent>
      </Card>

      {hasConditions ? (
        <>
          {/* Paramètres globaux */}
          <Card data-testid="global-params-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4" /> Paramètres globaux
              </CardTitle>
              <CardDescription>
                Ces choix s’appliquent à l’ensemble des conditions définies ci-dessous.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="combination-type">Combinaison *</Label>
                <select
                  id="combination-type"
                  className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                  {...register('combinationType')}
                >
                  {CombinationTypeEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p className="text-ink-500 text-xs">
                  {combinationType ? COMBINATION_LABELS[combinationType] : ''}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="evaluation-moment">Évaluation *</Label>
                <select
                  id="evaluation-moment"
                  className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                  {...register('evaluationMoment')}
                >
                  {EvaluationMomentEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p className="text-ink-500 text-xs">
                  {watch('evaluationMoment') ? EVALUATION_LABELS[watch('evaluationMoment')!] : ''}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="failure-action">En cas d’échec *</Label>
                <select
                  id="failure-action"
                  className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                  {...register('failureAction')}
                >
                  {FailureActionEnum.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p className="text-ink-500 text-xs">
                  {watch('failureAction') ? FAILURE_LABELS[watch('failureAction')!] : ''}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Bandeau pondération */}
          {combinationType === 'WEIGHTED' ? (
            <WeightValidationBanner total={totalWeight} conditionsCount={conditions.length} />
          ) : null}

          {/* Liste des conditions */}
          <Card data-testid="conditions-list-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4" /> Conditions ({conditions.length})
              </CardTitle>
              <CardDescription>
                {conditions.length === 0
                  ? 'Ajoutez au moins une condition pour activer la mécanique de performance.'
                  : `Maximum ${PLAN_WIZARD_LIMITS.MAX_CONDITIONS} conditions par plan.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {conditions.length === 0 ? (
                <p className="border-paper-300 text-ink-500 serif-italic rounded-md border border-dashed py-8 text-center text-sm">
                  Aucune condition pour l&apos;instant.
                </p>
              ) : (
                <div className="space-y-3">
                  {conditions.map((c, idx) => (
                    <ConditionEditor
                      key={c.id}
                      index={idx}
                      showWeight={showWeightColumn}
                      onRemove={() => removeCondition(idx)}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCondition}
                  disabled={conditions.length >= PLAN_WIZARD_LIMITS.MAX_CONDITIONS}
                  data-testid="add-condition"
                >
                  <Plus className="size-4" /> Ajouter une condition
                </Button>
                {conditions.length >= PLAN_WIZARD_LIMITS.MAX_CONDITIONS ? (
                  <p className="text-ink-500 text-xs" data-testid="add-condition-limit-message">
                    Limite atteinte ({PLAN_WIZARD_LIMITS.MAX_CONDITIONS} /{' '}
                    {PLAN_WIZARD_LIMITS.MAX_CONDITIONS}). Supprimez une condition pour en ajouter
                    une nouvelle.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  );
}
