'use client';

import { useFormContext } from 'react-hook-form';
import { Sparkles } from 'lucide-react';
import {
  LEAVER_TREATMENT_UI_LABELS,
  LEAVER_TYPE_UI_DESCRIPTIONS,
  LEAVER_TYPE_UI_LABELS,
  LeaverTreatmentEnum,
  LeaverTypeEnum,
  PLAN_TYPES_REQUIRING_EXERCISE_WINDOW,
  type PlanWizardData,
  type WizardLeaverTreatment,
  type WizardLeaverType,
} from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Step 5 — Règles de départ (leavers).
 *
 * Pour chaque type de départ (8 types), l'utilisateur choisit un
 * `treatment` (5 options) et complète éventuellement :
 *  - `accelerationMonths` si treatment === 'accelerate'
 *  - `exerciseWindowDays` si le planType requiert une fenêtre d'exercice
 *    (BSPCE / Stock Option / BSA / SAR — cf. PLAN_TYPES_REQUIRING_EXERCISE_WINDOW).
 *
 * 3 presets rapides en haut pour faciliter la saisie : « Standard FR
 * Tech », « Conservateur », « Founder-friendly ». Chaque preset
 * pré-remplit les 8 règles avec un treatment cohérent par type.
 *
 * Validation cross-field dans `planWizardSchema.superRefine` :
 *  - treatment === 'accelerate' → accelerationMonths > 0 obligatoire
 *  - autres treatments → accelerationMonths non applicable (warning)
 */

const LEAVER_TYPES_ORDER: WizardLeaverType[] = LeaverTypeEnum.options;

type LeaverPreset = {
  label: string;
  description: string;
  rules: Record<
    WizardLeaverType,
    { treatment: WizardLeaverTreatment; accelerationMonths?: number }
  >;
};

const LEAVER_PRESETS: ReadonlyArray<LeaverPreset> = [
  {
    label: 'Standard FR Tech',
    description: 'Profil le plus courant en France pour une scale-up.',
    rules: {
      resignation: { treatment: 'keep_vested' },
      termination_cause: { treatment: 'forfeit_all' },
      termination_no_cause: { treatment: 'keep_vested' },
      death: { treatment: 'full_accelerate' },
      retirement: { treatment: 'keep_vested' },
      company_sale: { treatment: 'full_accelerate' },
      mutual_agreement: { treatment: 'keep_vested' },
      end_of_contract: { treatment: 'keep_vested' },
    },
  },
  {
    label: 'Conservateur',
    description: 'Profil employeur — perte sur démission, conservation minimale.',
    rules: {
      resignation: { treatment: 'forfeit_all' },
      termination_cause: { treatment: 'forfeit_all' },
      termination_no_cause: { treatment: 'pro_rata' },
      death: { treatment: 'keep_vested' },
      retirement: { treatment: 'pro_rata' },
      company_sale: { treatment: 'accelerate', accelerationMonths: 12 },
      mutual_agreement: { treatment: 'pro_rata' },
      end_of_contract: { treatment: 'forfeit_all' },
    },
  },
  {
    label: 'Founder-friendly',
    description: 'Profil bénéficiaire — accélération généreuse.',
    rules: {
      resignation: { treatment: 'keep_vested' },
      termination_cause: { treatment: 'keep_vested' },
      termination_no_cause: { treatment: 'full_accelerate' },
      death: { treatment: 'full_accelerate' },
      retirement: { treatment: 'full_accelerate' },
      company_sale: { treatment: 'full_accelerate' },
      mutual_agreement: { treatment: 'full_accelerate' },
      end_of_contract: { treatment: 'full_accelerate' },
    },
  },
];

export function Step5Leavers() {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  const planType = watch('planType');
  const requiresExerciseWindow = planType
    ? PLAN_TYPES_REQUIRING_EXERCISE_WINDOW.has(planType)
    : false;
  const errors = formState.errors;
  const leaverErrors = errors.leaverRules as
    | Record<WizardLeaverType, { accelerationMonths?: { message?: string } } | undefined>
    | undefined;

  function applyPreset(preset: LeaverPreset) {
    setValue('leaverRules', preset.rules, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <section className="space-y-6" data-testid="step-5-leavers">
      <p className="text-muted-foreground text-sm">
        Définissez le traitement des droits acquis et non-acquis selon le motif de départ. Les
        valeurs ici sont applicables aux Server Actions / exports DocuSign et seront utilisées par
        le moteur Monte Carlo pour estimer la probabilité d&apos;exit.
      </p>

      {/* Presets rapides */}
      <Card data-testid="leaver-presets-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" /> Presets rapides
          </CardTitle>
          <CardDescription>
            Pré-remplit les 8 règles. Vous pourrez ensuite ajuster individuellement.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {LEAVER_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset)}
              title={preset.description}
              data-testid={`leaver-preset-${preset.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
            >
              {preset.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* 8 cards par type de leaver */}
      <div className="grid gap-4 lg:grid-cols-2">
        {LEAVER_TYPES_ORDER.map((leaverType) => {
          const treatment = watch(`leaverRules.${leaverType}.treatment`) as
            | WizardLeaverTreatment
            | undefined;
          const showAcceleration = treatment === 'accelerate';
          const accelErrorMsg = leaverErrors?.[leaverType]?.accelerationMonths?.message;
          return (
            <Card key={leaverType} data-testid={`leaver-card-${leaverType}`}>
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm font-semibold">
                  {LEAVER_TYPE_UI_LABELS[leaverType]}
                </CardTitle>
                <CardDescription className="text-xs">
                  {LEAVER_TYPE_UI_DESCRIPTIONS[leaverType]}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`leaver-${leaverType}-treatment`} className="text-xs">
                    Traitement *
                  </Label>
                  <select
                    id={`leaver-${leaverType}-treatment`}
                    className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                    {...register(`leaverRules.${leaverType}.treatment`)}
                    // Controlled value plutôt que defaultValue : sans ça
                    // un `reset()` du form ne re-sync pas le DOM (React
                    // ne touche pas defaultValue après le 1er mount).
                    value={treatment ?? ''}
                  >
                    <option value="">— Choisir —</option>
                    {LeaverTreatmentEnum.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {LEAVER_TREATMENT_UI_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                </div>

                {showAcceleration ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`leaver-${leaverType}-accel`} className="text-xs">
                      Mois d’accélération *
                    </Label>
                    <Input
                      id={`leaver-${leaverType}-accel`}
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      placeholder="Ex : 12"
                      aria-invalid={!!accelErrorMsg}
                      className="h-8 font-mono"
                      {...register(`leaverRules.${leaverType}.accelerationMonths`, {
                        valueAsNumber: true,
                      })}
                    />
                    {accelErrorMsg ? (
                      <p className="text-destructive text-xs">{String(accelErrorMsg)}</p>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Combien de mois supplémentaires sont vested au départ.
                      </p>
                    )}
                  </div>
                ) : accelErrorMsg ? (
                  // Cas « accelerationMonths défini mais traitement ≠ accelerate » :
                  // l'input n'est pas rendu mais l'erreur Zod existe — on
                  // l'affiche au niveau card pour qu'elle reste visible.
                  <p className="text-destructive text-xs">{String(accelErrorMsg)}</p>
                ) : null}

                {requiresExerciseWindow ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`leaver-${leaverType}-window`} className="text-xs">
                      Fenêtre d’exercice (jours)
                    </Label>
                    <Input
                      id={`leaver-${leaverType}-window`}
                      type="number"
                      min={0}
                      max={3650}
                      step={1}
                      placeholder="Ex : 90"
                      className="h-8 font-mono"
                      {...register(`leaverRules.${leaverType}.exerciseWindowDays`, {
                        valueAsNumber: true,
                      })}
                    />
                    <p className="text-muted-foreground text-xs">
                      Délai pour exercer les options après le départ. 90 jours est standard.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
