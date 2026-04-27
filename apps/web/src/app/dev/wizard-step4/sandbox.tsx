'use client';

import { FormProvider, useForm, type Resolver, type UseFormReset } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { planWizardSchema, type PlanWizardData } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Step4Performance } from '@/components/plans/wizard/steps/Step4Performance';

/**
 * Sandbox /dev/wizard-step4 — vérifie le rendu de Step 4 (commit 4.1)
 * en isolation. Presets pour basculer entre les modes de combinaison
 * (AND / OR / WEIGHTED) et le nombre de conditions.
 */

// Module-scope counter pour générer des ids stables sans dépendre de
// Date.now()/Math.random() pendant le render (lint impure-function).
let __presetCounter = 0;
function uuid(suffix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  __presetCounter += 1;
  return `cond-${suffix}-${__presetCounter}`;
}
export function WizardStep4Sandbox() {
  const methods = useForm<PlanWizardData>({
    resolver: zodResolver(planWizardSchema) as unknown as Resolver<PlanWizardData>,
    mode: 'onChange',
    defaultValues: {
      planType: 'BSPCE',
      grantDate: '2026-01-01',
      hasPerformanceConditions: false,
    },
  });

  const reset = methods.reset as UseFormReset<PlanWizardData>;
  async function applyPreset(values: Partial<PlanWizardData>) {
    reset(values as PlanWizardData);
    await methods.trigger();
  }

  const presets: Array<{ label: string; apply: () => void }> = [
    {
      label: 'Désactivé',
      apply: () =>
        applyPreset({
          planType: 'BSPCE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
        }),
    },
    {
      label: 'Activé · vide',
      apply: () =>
        applyPreset({
          planType: 'BSPCE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [],
        }),
    },
    {
      label: 'AND · 2 conditions',
      apply: () =>
        applyPreset({
          planType: 'BSPCE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('a'),
              name: 'EBITDA cumulé > 50 M€',
              conditionType: 'NON_MARKET',
              category: 'FINANCIAL',
              weight: 50,
              enablePartialScoring: true,
            },
            {
              id: uuid('b'),
              name: 'NPS ≥ 60 sur 3 trimestres',
              conditionType: 'NON_MARKET',
              category: 'OPERATIONAL',
              weight: 50,
              enablePartialScoring: true,
            },
          ],
        }),
    },
    {
      label: 'WEIGHTED · 60/40 (OK)',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'WEIGHTED',
          evaluationMoment: 'END',
          failureAction: 'PARTIAL',
          conditions: [
            {
              id: uuid('w1'),
              name: 'TSR vs CAC 40',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 60,
              enablePartialScoring: true,
              performanceStartDate: '2026-01-01',
              performanceEndDate: '2029-01-01',
            },
            {
              id: uuid('w2'),
              name: 'Score ESG ≥ 70',
              conditionType: 'NON_MARKET',
              category: 'ESG',
              weight: 40,
              enablePartialScoring: true,
            },
          ],
        }),
    },
    {
      label: 'WEIGHTED · 50/40 (KO)',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'WEIGHTED',
          evaluationMoment: 'END',
          failureAction: 'PARTIAL',
          conditions: [
            {
              id: uuid('k1'),
              name: 'TSR vs CAC 40',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 50,
              enablePartialScoring: true,
              performanceStartDate: '2026-01-01',
              performanceEndDate: '2029-01-01',
            },
            {
              id: uuid('k2'),
              name: 'Score ESG ≥ 70',
              conditionType: 'NON_MARKET',
              category: 'ESG',
              weight: 40,
              enablePartialScoring: true,
            },
          ],
        }),
    },
    {
      label: 'OR · 3 mixtes',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'OR',
          evaluationMoment: 'ANNUAL',
          failureAction: 'DEFER',
          conditions: [
            {
              id: uuid('o1'),
              name: 'TSR ≥ 50 % en 3 ans',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              performanceStartDate: '2026-01-01',
              performanceEndDate: '2029-01-01',
            },
            {
              id: uuid('o2'),
              name: 'Présence 5 ans',
              conditionType: 'SERVICE',
              category: 'STRATEGIC',
              weight: 100,
              enablePartialScoring: false,
            },
            {
              id: uuid('o3'),
              name: 'CA > 500 M€',
              conditionType: 'NON_MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
            },
          ],
        }),
    },
  ];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-muted-foreground font-mono text-xs uppercase">/dev — sandbox</p>
        <h1 className="text-2xl font-semibold tracking-tight">Step 4 — Performance (4.1)</h1>
        <p className="text-muted-foreground text-sm">
          Squelette : toggle, paramètres globaux, ConditionEditor (header collapsible),
          WeightValidationBanner. Les sous-formulaires spécifiques au type de condition arrivent
          dans les commits 4.2 → 4.10.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={p.apply}
            data-testid={`preset-${p.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <FormProvider {...methods}>
        <Step4Performance />
      </FormProvider>

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Form state (debug)</summary>
        <pre className="mt-2 overflow-x-auto text-[10px] leading-tight">
          {JSON.stringify(
            {
              isValid: methods.formState.isValid,
              errorKeys: Object.keys(methods.formState.errors),
              values: methods.getValues(),
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}
