'use client';

import { useState } from 'react';
import { FormProvider, useForm, useFormContext, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { planWizardSchema, type PlanWizardData } from '@equity/shared';
import { Step1PlanType } from './steps/Step1PlanType';
import { Step2GeneralInfo } from './steps/Step2GeneralInfo';
import { Step3Vesting } from './steps/Step3Vesting';
import { Step4Performance } from './steps/Step4Performance';
import { Step5Leavers } from './steps/Step5Leavers';
import { Step6Valuation } from './steps/Step6Valuation';
import { Step7Review } from './steps/Step7Review';
import { WizardFooter } from './WizardFooter';
import { WizardSidebar } from './WizardSidebar';
import { useWizardForm } from './lib/use-wizard-form';
import {
  useWizardPersistence,
  type LoadServerDraftFn,
  type SaveDraftFn,
} from './lib/use-wizard-persistence';
import { WIZARD_STEPS, type WizardStepId } from './lib/wizard-steps';

/**
 * MODULE_03A_PLANS — container du wizard de création de plan.
 *
 * Englobe :
 *  - 1 `<FormProvider>` RHF unique pour les 7 steps
 *  - `<WizardSidebar>` (gauche) + zone de contenu (droite)
 *  - `<WizardFooter>` sticky en bas
 *  - `useWizardForm` (navigation) + `useWizardPersistence` (auto-save)
 *
 * Soumission : à la fin du Step 7, l'utilisateur clique « Créer le
 * plan » qui appelle `onSubmit(data)`. La validation finale globale
 * (tous les superRefine cross-field) est déclenchée par
 * `methods.handleSubmit(...)`.
 *
 * Bandeau info au mount si un brouillon a été restauré (info muette
 * sinon).
 */
export function PlanWizard({
  onSubmit,
  saveDraft,
  loadServerDraft,
  initialValues,
}: {
  /** Server Action de création du plan. Reçoit le payload validé Zod. */
  onSubmit: (
    data: PlanWizardData,
  ) => Promise<{ ok: true; planId: string } | { ok: false; error: string }>;
  /** Server Action d'auto-save du brouillon (optionnelle). */
  saveDraft?: SaveDraftFn;
  /** Server Action de chargement de brouillon distant (optionnelle). */
  loadServerDraft?: LoadServerDraftFn;
  /** Valeurs initiales (édition d'un plan existant). */
  initialValues?: Partial<PlanWizardData>;
}) {
  const methods = useForm<PlanWizardData>({
    resolver: zodResolver(planWizardSchema) as unknown as Resolver<PlanWizardData>,
    mode: 'onChange',
    defaultValues: {
      planType: 'BSPCE',
      hasPerformanceConditions: false,
      ...initialValues,
    } as PlanWizardData,
  });

  const [submitState, setSubmitState] = useState<{
    isSubmitting: boolean;
    error: string | null;
    planId: string | null;
  }>({ isSubmitting: false, error: null, planId: null });

  return (
    <FormProvider {...methods}>
      <WizardInner
        onSubmit={onSubmit}
        saveDraft={saveDraft}
        loadServerDraft={loadServerDraft}
        submitState={submitState}
        setSubmitState={setSubmitState}
      />
    </FormProvider>
  );
}

function WizardInner({
  onSubmit,
  saveDraft,
  loadServerDraft,
  submitState,
  setSubmitState,
}: {
  onSubmit: (
    data: PlanWizardData,
  ) => Promise<{ ok: true; planId: string } | { ok: false; error: string }>;
  saveDraft?: SaveDraftFn;
  loadServerDraft?: LoadServerDraftFn;
  submitState: { isSubmitting: boolean; error: string | null; planId: string | null };
  setSubmitState: (s: {
    isSubmitting: boolean;
    error: string | null;
    planId: string | null;
  }) => void;
}) {
  const wizard = useWizardForm();
  const persistence = useWizardPersistence({ saveDraft, loadServerDraft });
  const { trigger, getValues, formState } = useFormContext<PlanWizardData>();

  /**
   * Soumission finale : trigger() global qui force toute la validation
   * Zod (incluant les superRefine cross-field), puis appelle la Server
   * Action `onSubmit` si tout est OK.
   *
   * Sur échec : on liste les fields en erreur dans le banner pour que
   * l'utilisateur sache où aller corriger (vs un message générique
   * « il y a des erreurs » qui force du devinage).
   */
  const handleFinalSubmit = async () => {
    const ok = await trigger();
    if (!ok) {
      const errorFields = collectErrorFieldPaths(formState.errors);
      const summary =
        errorFields.length > 0
          ? `Le formulaire contient encore des erreurs sur : ${errorFields.slice(0, 6).join(', ')}${errorFields.length > 6 ? `, +${errorFields.length - 6}` : ''}.`
          : 'Le formulaire contient encore des erreurs — corrigez-les avant de créer le plan.';
      setSubmitState({
        isSubmitting: false,
        error: summary,
        planId: null,
      });
      return;
    }
    setSubmitState({ isSubmitting: true, error: null, planId: null });
    try {
      const result = await onSubmit(getValues());
      if (result.ok) {
        setSubmitState({ isSubmitting: false, error: null, planId: result.planId });
        persistence.clearDraft();
      } else {
        setSubmitState({ isSubmitting: false, error: result.error, planId: null });
      }
    } catch (e) {
      setSubmitState({
        isSubmitting: false,
        error: e instanceof Error ? e.message : 'Erreur inconnue',
        planId: null,
      });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <WizardSidebar
        steps={wizard.steps}
        currentStep={wizard.currentStep}
        visitedSteps={wizard.visitedSteps}
        onStepClick={wizard.goToStep}
        isStepCompleted={wizard.isStepCompleted}
      />
      <div className="space-y-4">
        {persistence.restoredFrom ? (
          <div
            className="border-primary/20 bg-primary/5 text-foreground flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
            data-testid="wizard-restored-banner"
          >
            <Info className="text-primary mt-0.5 size-4 shrink-0" />
            <p>
              Brouillon restauré depuis{' '}
              <strong>
                {persistence.restoredFrom === 'local' ? 'le navigateur' : 'le serveur'}
              </strong>
              . Vous pouvez continuer ou{' '}
              <button
                type="button"
                className="hover:text-primary underline underline-offset-2"
                onClick={persistence.clearDraft}
              >
                tout recommencer
              </button>
              .
            </p>
          </div>
        ) : null}

        {submitState.planId ? (
          <div
            className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200"
            data-testid="wizard-success-banner"
          >
            ✓ Plan créé avec succès — id <code className="font-mono">{submitState.planId}</code>
          </div>
        ) : null}

        {submitState.error ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm"
            data-testid="wizard-error-banner"
          >
            ⚠ {submitState.error}
          </div>
        ) : null}

        <CurrentStepRenderer stepId={wizard.currentStep} />

        <WizardFooter
          isFirst={wizard.isFirst}
          isLast={wizard.isLast}
          isValidating={wizard.isValidating}
          isSubmitting={submitState.isSubmitting}
          canProceed={wizard.getCanProceed(wizard.currentStep)}
          onPrev={wizard.prev}
          onNext={() => {
            void wizard.next();
          }}
          onSubmit={() => {
            void handleFinalSubmit();
          }}
          onSaveNow={() => {
            void persistence.saveNow();
          }}
          onClearDraft={persistence.clearDraft}
          draftMeta={persistence.meta}
        />
      </div>
    </div>
  );
}

function CurrentStepRenderer({ stepId }: { stepId: WizardStepId }) {
  const stepDef = WIZARD_STEPS.find((s) => s.id === stepId);
  return (
    <article className="space-y-4" data-testid={`wizard-step-content-${stepId}`}>
      <header className="space-y-1">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Étape {stepId} / 7</p>
        <h2 className="text-xl font-semibold tracking-tight">{stepDef?.title}</h2>
      </header>
      {stepId === 1 ? <Step1PlanType /> : null}
      {stepId === 2 ? <Step2GeneralInfo /> : null}
      {stepId === 3 ? <Step3Vesting /> : null}
      {stepId === 4 ? <Step4Performance /> : null}
      {stepId === 5 ? <Step5Leavers /> : null}
      {stepId === 6 ? <Step6Valuation /> : null}
      {stepId === 7 ? <Step7Review /> : null}
    </article>
  );
}

/**
 * Walk récursif dans `formState.errors` pour collecter tous les paths
 * (champs RHF) qui ont une erreur. Affiché dans le banner d'erreur de
 * `handleFinalSubmit` pour aider l'utilisateur à localiser le problème
 * sans devoir parcourir toutes les étapes.
 */
function collectErrorFieldPaths(errors: unknown, parentPath = ''): string[] {
  if (!errors || typeof errors !== 'object') return [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    if (value && typeof value === 'object' && 'message' in value && 'type' in value) {
      // Leaf RHF FieldError { type, message, ref? }
      paths.push(path);
    } else if (value && typeof value === 'object') {
      // Nested object (array index, sub-form, etc.)
      paths.push(...collectErrorFieldPaths(value, path));
    }
  }
  return paths;
}
