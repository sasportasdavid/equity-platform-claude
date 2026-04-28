'use client';

import { useState } from 'react';
import { FormProvider, useForm, type Resolver, type UseFormReset } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { planWizardSchema, type PlanWizardData, type PlanWizardType } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Step3Vesting } from '@/components/plans/wizard/steps/Step3Vesting';

const PLAN_TYPES_FOR_DROPDOWN: readonly PlanWizardType[] = [
  'BSPCE',
  'AGA',
  'STOCK_OPTION',
  'BSA',
  'PERFORMANCE_SHARE',
  'PHANTOM',
  'ESOP',
  'RSU',
  'SAR',
];

/**
 * Sandbox pour valider le rendu visuel de Step3Vesting de façon isolée
 * (sans le wizard parent ni le router /dashboard/plans/new qui n'existe
 * pas encore).
 */
export function WizardStep3Sandbox() {
  const [planType, setPlanType] = useState<PlanWizardType>('AGA');
  const [grantDate, setGrantDate] = useState<string>('2026-01-01');

  const methods = useForm<PlanWizardData>({
    // Zod `.default()` rend la version "input" du schéma plus permissive que
    // l'output ; le resolver inféré ne matche pas le type strict
    // `PlanWizardData` (= output). Cast bénin : RHF reste type-safe sur les
    // setValue/watch côté composant.
    resolver: zodResolver(planWizardSchema) as unknown as Resolver<PlanWizardData>,
    mode: 'onChange',
    defaultValues: {
      planType,
      grantDate,
      vestingType: 'cliff_linear',
      cliffMonths: 12,
      cliffPercentage: 25,
      totalMonths: 48,
      frequency: 'monthly',
    },
  });

  function syncContext(nextPlanType: PlanWizardType, nextGrantDate: string) {
    setPlanType(nextPlanType);
    setGrantDate(nextGrantDate);
    methods.setValue('planType', nextPlanType, { shouldValidate: true });
    methods.setValue('grantDate', nextGrantDate, { shouldValidate: true });
  }

  // RHF reset accepte un objet partiel ; on cast pour bypass le strict-mode
  // typing sur les fields default-d'enum (enablePartialScoring=true...).
  // Après le reset on force un trigger() pour exposer immédiatement les
  // erreurs Zod cross-field (par défaut, RHF ne revalide pas après reset
  // tant qu'aucun champ n'est touché — ce qui rend les presets KO muets).
  const reset = methods.reset as UseFormReset<PlanWizardData>;
  async function applyPreset(values: Partial<PlanWizardData>) {
    reset(values as PlanWizardData);
    await methods.trigger();
  }

  const presets: Array<{ label: string; apply: () => void }> = [
    {
      label: 'Tranches 4×25%',
      apply: () =>
        applyPreset({
          planType,
          grantDate,
          vestingType: 'tranches',
          vestingTranches: [
            { vestingDate: '2027-01-01', percentage: 25 },
            { vestingDate: '2028-01-01', percentage: 25 },
            { vestingDate: '2029-01-01', percentage: 25 },
            { vestingDate: '2030-01-01', percentage: 25 },
          ],
        }),
    },
    {
      label: 'Tranches 3×30% (KO)',
      apply: () =>
        applyPreset({
          planType,
          grantDate,
          vestingType: 'tranches',
          vestingTranches: [
            { vestingDate: '2027-01-01', percentage: 30 },
            { vestingDate: '2028-01-01', percentage: 30 },
            { vestingDate: '2029-01-01', percentage: 30 },
          ],
        }),
    },
    {
      label: 'Cliff_linear 12/25/48 monthly',
      apply: () =>
        applyPreset({
          planType,
          grantDate,
          vestingType: 'cliff_linear',
          cliffMonths: 12,
          cliffPercentage: 25,
          totalMonths: 48,
          frequency: 'monthly',
        }),
    },
    {
      label: 'AGA cliff_linear totalMonths=10 (warning)',
      apply: () => {
        setPlanType('AGA');
        applyPreset({
          planType: 'AGA',
          grantDate,
          vestingType: 'cliff_linear',
          cliffMonths: 6,
          cliffPercentage: 50,
          totalMonths: 10,
          frequency: 'monthly',
        });
      },
    },
    {
      label: 'Single (date OK)',
      apply: () =>
        applyPreset({
          planType,
          grantDate,
          vestingType: 'single',
          singleVestingDate: '2027-01-01',
        }),
    },
    {
      label: 'Single (date < grantDate, KO)',
      apply: () =>
        applyPreset({
          planType,
          grantDate,
          vestingType: 'single',
          singleVestingDate: '2025-01-01',
        }),
    },
  ];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-muted-foreground font-mono text-xs uppercase">/dev — sandbox</p>
        <h1 className="text-2xl font-semibold tracking-tight">Step 3 — Vesting</h1>
        <p className="text-muted-foreground text-sm">
          Prévisualisation isolée. Réglez le contexte (type de plan, date d’attribution) puis
          appliquez un preset pour vérifier chacun des modes.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dev-plan-type">planType</Label>
            <select
              id="dev-plan-type"
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
              value={planType}
              onChange={(e) => syncContext(e.target.value as PlanWizardType, grantDate)}
            >
              {PLAN_TYPES_FOR_DROPDOWN.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-grant-date">grantDate</Label>
            <Input
              id="dev-grant-date"
              type="date"
              value={grantDate}
              onChange={(e) => syncContext(planType, e.target.value)}
            />
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
            data-testid={`preset-${p.label.replace(/\s+/g, '-').toLowerCase()}`}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <FormProvider {...methods}>
        <Step3Vesting />
      </FormProvider>

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Form state (debug)</summary>
        <pre className="mt-2 overflow-x-auto text-[10px] leading-tight">
          {JSON.stringify(
            {
              isValid: methods.formState.isValid,
              errors: Object.keys(methods.formState.errors),
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
