'use client';

import { useState } from 'react';
import { FormProvider, useForm, type Resolver, type UseFormReset } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { planWizardSchema, type PlanWizardData, type PlanWizardType } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Step5Leavers } from '@/components/plans/wizard/steps/Step5Leavers';

/**
 * Sandbox /dev/wizard-step5 — vérifie le rendu de Step5Leavers en isolation.
 *
 * Le composant dépend de `planType` (pour décider d'afficher le champ
 * `exerciseWindowDays`). On expose donc un sélecteur de planType en haut
 * pour basculer entre AGA (sans fenêtre d'exercice) et BSPCE / Stock
 * Option / BSA / SAR (avec fenêtre d'exercice).
 */

const PLAN_TYPES_FOR_DROPDOWN: readonly PlanWizardType[] = [
  'AGA',
  'BSPCE',
  'STOCK_OPTION',
  'BSA',
  'PERFORMANCE_SHARE',
  'PHANTOM',
  'ESOP',
  'RSU',
  'SAR',
];

// Sérialise un sous-arbre d'errors RHF en omettant les `ref` circulaires
// pour pouvoir l'afficher en debug.
function serializeErrors(errors: unknown): unknown {
  if (!errors || typeof errors !== 'object') return errors;
  if (Array.isArray(errors)) return errors.map(serializeErrors);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(errors as Record<string, unknown>)) {
    if (k === 'ref') continue;
    out[k] = serializeErrors(v);
  }
  return out;
}

export function WizardStep5Sandbox() {
  const [planType, setPlanType] = useState<PlanWizardType>('AGA');

  const methods = useForm<PlanWizardData>({
    resolver: zodResolver(planWizardSchema) as unknown as Resolver<PlanWizardData>,
    mode: 'onChange',
    defaultValues: {
      planType,
      grantDate: '2026-01-01',
      hasPerformanceConditions: false,
      leaverRules: {},
    },
  });

  const reset = methods.reset as UseFormReset<PlanWizardData>;
  async function applyPreset(values: Partial<PlanWizardData>) {
    reset(values as PlanWizardData);
    await new Promise((r) => setTimeout(r, 0));
    await methods.trigger();
  }

  function syncPlanType(next: PlanWizardType) {
    setPlanType(next);
    methods.setValue('planType', next, { shouldValidate: true });
  }

  const presets: Array<{ label: string; apply: () => void }> = [
    {
      label: 'Vide (rien défini)',
      apply: () =>
        applyPreset({
          planType,
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          leaverRules: {},
        }),
    },
    {
      label: 'Standard FR + 90j window',
      apply: () =>
        applyPreset({
          planType,
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          leaverRules: {
            resignation: { treatment: 'keep_vested', exerciseWindowDays: 90 },
            termination_cause: { treatment: 'forfeit_all', exerciseWindowDays: 0 },
            termination_no_cause: { treatment: 'keep_vested', exerciseWindowDays: 90 },
            death: { treatment: 'full_accelerate', exerciseWindowDays: 365 },
            retirement: { treatment: 'keep_vested', exerciseWindowDays: 365 },
            company_sale: { treatment: 'full_accelerate', exerciseWindowDays: 90 },
            mutual_agreement: { treatment: 'keep_vested', exerciseWindowDays: 90 },
            end_of_contract: { treatment: 'keep_vested', exerciseWindowDays: 90 },
          },
        }),
    },
    {
      label: 'Accélération company_sale (12 mois)',
      apply: () =>
        applyPreset({
          planType,
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          leaverRules: {
            resignation: { treatment: 'forfeit_all' },
            termination_cause: { treatment: 'forfeit_all' },
            termination_no_cause: { treatment: 'pro_rata' },
            death: { treatment: 'keep_vested' },
            retirement: { treatment: 'keep_vested' },
            company_sale: { treatment: 'accelerate', accelerationMonths: 12 },
            mutual_agreement: { treatment: 'pro_rata' },
            end_of_contract: { treatment: 'forfeit_all' },
          },
        }),
    },
    {
      label: 'KO · accelerate sans mois',
      apply: () =>
        applyPreset({
          planType,
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          leaverRules: {
            company_sale: { treatment: 'accelerate' }, // accelerationMonths absent → erreur
          },
        }),
    },
    {
      label: 'KO · forfeit avec accelerationMonths',
      apply: () =>
        applyPreset({
          planType,
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          leaverRules: {
            resignation: { treatment: 'forfeit_all', accelerationMonths: 12 }, // non applicable
          },
        }),
    },
  ];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-muted-foreground font-mono text-xs uppercase">/dev — sandbox</p>
        <h1 className="text-2xl font-semibold tracking-tight">Step 5 — Leavers</h1>
        <p className="text-muted-foreground text-sm">
          Règles de départ : 8 types × 5 traitements + accelerationMonths conditionnel +
          exerciseWindowDays selon le planType. Les presets rapides du composant peuvent être
          combinés avec les presets sandbox ci-dessous.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dev-plan-type">planType (impacte exerciseWindowDays)</Label>
            <select
              id="dev-plan-type"
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
              value={planType}
              onChange={(e) => syncPlanType(e.target.value as PlanWizardType)}
            >
              {PLAN_TYPES_FOR_DROPDOWN.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

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
        <Step5Leavers />
      </FormProvider>

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Form state (debug)</summary>
        <pre className="mt-2 overflow-x-auto text-[10px] leading-tight">
          {JSON.stringify(
            {
              isValid: methods.formState.isValid,
              errorKeys: Object.keys(methods.formState.errors),
              errorsLeaverRules: serializeErrors(methods.formState.errors.leaverRules),
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
