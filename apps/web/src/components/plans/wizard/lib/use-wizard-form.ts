'use client';

import { useCallback, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { PlanWizardData } from '@equity/shared';
import {
  TOTAL_STEPS,
  WIZARD_STEPS,
  getStepFields,
  isStepLogicallyEmpty,
  type WizardStepId,
} from './wizard-steps';

/**
 * Hook de navigation du wizard.
 *
 * À appeler dans un composant enfant d'un `<FormProvider>` qui fournit
 * `useFormContext<PlanWizardData>`.
 *
 * Expose :
 *  - `currentStep` : ID 1-7 de l'étape courante
 *  - `visitedSteps` : Set des IDs déjà visités (autorise navigation libre)
 *  - `next()` : valide les fields du step courant via `methods.trigger`
 *    et avance si OK. Marque l'étape suivante comme visited. Retourne
 *    le succès.
 *  - `prev()` : recule sans validation
 *  - `goToStep(n)` : navigation directe — autorisée seulement si `n` est
 *    dans `visitedSteps` ou `n <= currentStep` (pas de saut en avant).
 *  - `getCanProceed(step)` : indique si l'étape `step` est valide à
 *    l'instant T (utile pour le bouton « Suivant » désactivé).
 *
 * La validation finale globale (cross-step via superRefine) est
 * déclenchée à la soumission par `methods.handleSubmit(...)`.
 */
export function useWizardForm(initial: WizardStepId = 1) {
  const [currentStep, setCurrentStep] = useState<WizardStepId>(initial);
  const [visitedSteps, setVisitedSteps] = useState<Set<WizardStepId>>(
    () => new Set<WizardStepId>([initial]),
  );
  const [isValidating, setIsValidating] = useState(false);
  const { trigger, formState, getValues } = useFormContext<PlanWizardData>();

  const next = useCallback(async () => {
    if (currentStep >= TOTAL_STEPS) return false;
    const fields = getStepFields(currentStep, getValues());
    setIsValidating(true);
    try {
      const ok = fields.length === 0 ? true : await trigger(fields);
      if (ok) {
        const nextStep = (currentStep + 1) as WizardStepId;
        setCurrentStep(nextStep);
        setVisitedSteps((s) => new Set(s).add(nextStep));
      }
      return ok;
    } finally {
      setIsValidating(false);
    }
  }, [currentStep, trigger, getValues]);

  const prev = useCallback(() => {
    if (currentStep <= 1) return;
    setCurrentStep((s) => (s - 1) as WizardStepId);
  }, [currentStep]);

  /**
   * Navigation directe vers `n`. Refuse les sauts en avant vers une
   * étape jamais visitée — garantit que le user ne saute pas la
   * validation des étapes intermédiaires.
   */
  const goToStep = useCallback(
    (n: WizardStepId) => {
      if (n < 1 || n > TOTAL_STEPS) return;
      if (n > currentStep && !visitedSteps.has(n)) return;
      setCurrentStep(n);
      setVisitedSteps((s) => new Set(s).add(n));
    },
    [currentStep, visitedSteps],
  );

  /**
   * Heuristique légère pour le bouton « Suivant » : on regarde
   * `formState.errors` projeté sur les fields du step. C'est non
   * authoritatif (la vraie validation se fait au `next()`) mais évite
   * d'afficher un bouton enabled qui mène à une erreur.
   *
   * Si l'étape est logiquement vide pour la condition courante (ex :
   * Step 4 quand `hasPerformanceConditions === false`), on retourne
   * toujours true.
   */
  const getCanProceed = useCallback(
    (step: WizardStepId): boolean => {
      const data = getValues();
      if (isStepLogicallyEmpty(step, data)) return true;
      const fields = getStepFields(step, data);
      const errors = formState.errors as Record<string, unknown>;
      return !fields.some((f) => errors[f] != null);
    },
    [formState.errors, getValues],
  );

  /** Étapes complétées (validées via `next()` au moins une fois). */
  const isStepCompleted = useCallback(
    (step: WizardStepId): boolean => visitedSteps.has(step) && step < currentStep,
    [currentStep, visitedSteps],
  );

  return {
    currentStep,
    visitedSteps,
    isValidating,
    isFirst: currentStep === 1,
    isLast: currentStep === TOTAL_STEPS,
    next,
    prev,
    goToStep,
    getCanProceed,
    isStepCompleted,
    steps: WIZARD_STEPS,
  };
}
