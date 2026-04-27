'use client';

import { FormProvider, useForm, type Resolver, type UseFormReset } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { planWizardSchema, type PlanWizardData } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Step4Performance } from '@/components/plans/wizard/steps/Step4Performance';

/**
 * Sandbox /dev/wizard-step4 — vérifie le rendu de Step 4 en isolation.
 *
 * Deux groupes de presets :
 *  - **Squelette (4.1)** : toggle / globals / WeightValidationBanner / mixtes
 *  - **NON_MARKET (4.2)** : 5 cas couvrant les 9 métriques + cas champs vides
 *
 * Pour chaque preset on appelle `applyPreset` qui fait un `reset()` + un
 * `methods.trigger()` afin d'exposer immédiatement les erreurs Zod
 * cross-field (par défaut, RHF ne revalide qu'au premier touch d'un champ).
 */

// Fallback compteur pour environnements où crypto.randomUUID()
// n'est pas dispo (très rare). Date.now() est exclu car Next 16
// le détecte comme impur en render component.
let presetCounter = 0;
function uuid(suffix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  presetCounter += 1;
  return `cond-${suffix}-${presetCounter}`;
}

type Preset = { label: string; group: '4.1' | '4.2' | '4.3' | '4.4'; apply: () => void };

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

  const presets: Preset[] = [
    // ----- Groupe 4.3 — branche SERVICE -----
    // Ces presets restent en haut du tableau pour qu'ils soient au-dessus
    // du formulaire (les sections sont rendues dans l'ordre du tableau).
    {
      label: '4.3 · Présence (durée du plan)',
      group: '4.3',
      apply: () =>
        applyPreset({
          planType: 'AGA',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('svc-presence'),
              name: 'Présence à la date d’acquisition',
              conditionType: 'SERVICE',
              category: 'STRATEGIC',
              weight: 100,
              enablePartialScoring: false,
            },
          ],
        }),
    },
    {
      label: '4.3 · Présence + OPERATIONAL',
      group: '4.3',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('svc-op'),
              name: 'Présence opérationnelle continue',
              conditionType: 'SERVICE',
              category: 'OPERATIONAL',
              weight: 100,
              enablePartialScoring: false,
            },
          ],
        }),
    },
    {
      label: '4.3 · Stress switch · NON_MARKET zombie',
      group: '4.3',
      apply: () =>
        // Cas explicite pour stresser cleanConditionForType : on insère une
        // condition SERVICE qui contient des champs NON_MARKET orphelins
        // (metric, comparisonOperator, targetValue). Le cleanup au switch
        // ne se déclenche qu'à un changement de type via l'UI ; ici on
        // pose le préset tel quel pour vérifier que la validation Zod ne
        // les exige pas pour SERVICE (et qu'on les voit dans les values
        // debug AVANT le premier toggle de type dans l'UI).
        applyPreset({
          planType: 'AGA',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('svc-zombie'),
              name: 'SERVICE avec orphelins',
              conditionType: 'SERVICE',
              category: 'STRATEGIC',
              weight: 100,
              enablePartialScoring: false,
              metric: 'EBITDA', // orphelin, ne doit pas faire échouer la validation
              comparisonOperator: '>=', // orphelin
              targetValue: '50000000', // orphelin
              targetUnit: '€', // orphelin
            },
          ],
        }),
    },

    // ----- Groupe 4.4 — branche MARKET (SHARE_PRICE / TSR_ABS) -----
    {
      label: '4.4 · SHARE_PRICE ≥ 200 €',
      group: '4.4',
      apply: () =>
        applyPreset({
          planType: 'STOCK_OPTION',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('mkt-share-price'),
              name: 'Cours ≥ 200 € à 3 ans',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              marketMetricType: 'SHARE_PRICE',
              comparisonOperator: '>=',
              targetValue: '200',
              targetUnit: '€',
              performanceStartDate: '2026-01-01',
              performanceEndDate: '2029-01-01',
            },
          ],
        }),
    },
    {
      label: '4.4 · TSR_ABS ≥ 30 % sur 3 ans',
      group: '4.4',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'PARTIAL',
          conditions: [
            {
              id: uuid('mkt-tsr-abs'),
              name: 'TSR absolu ≥ 30 % à 3 ans',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              marketMetricType: 'TSR_ABS',
              comparisonOperator: '>=',
              targetValue: '30',
              targetUnit: '%',
              performanceStartDate: '2026-01-01',
              performanceEndDate: '2029-01-01',
            },
          ],
        }),
    },
    {
      label: '4.4 · KO · dates manquantes',
      group: '4.4',
      apply: () =>
        applyPreset({
          planType: 'STOCK_OPTION',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('mkt-ko-dates'),
              name: 'SHARE_PRICE sans dates',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              marketMetricType: 'SHARE_PRICE',
              comparisonOperator: '>=',
              targetValue: '200',
              targetUnit: '€',
              // dates volontairement absentes → 2 erreurs Zod
            },
          ],
        }),
    },
    {
      label: '4.4 · KO · endDate ≤ startDate',
      group: '4.4',
      apply: () =>
        applyPreset({
          planType: 'STOCK_OPTION',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('mkt-ko-end-before'),
              name: 'TSR avec end < start',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              marketMetricType: 'TSR_ABS',
              comparisonOperator: '>=',
              targetValue: '30',
              targetUnit: '%',
              performanceStartDate: '2029-01-01',
              performanceEndDate: '2026-01-01',
            },
          ],
        }),
    },
    {
      label: '4.4 · KO · start < grantDate',
      group: '4.4',
      apply: () =>
        applyPreset({
          planType: 'STOCK_OPTION',
          grantDate: '2026-06-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('mkt-ko-start-before-grant'),
              name: 'Start avant grantDate',
              conditionType: 'MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              marketMetricType: 'TSR_ABS',
              comparisonOperator: '>=',
              targetValue: '30',
              targetUnit: '%',
              performanceStartDate: '2026-01-01', // < grantDate 2026-06-01
              performanceEndDate: '2029-01-01',
            },
          ],
        }),
    },

    // ----- Groupe 4.1 — squelette / structure -----
    {
      label: 'Désactivé',
      group: '4.1',
      apply: () =>
        applyPreset({
          planType: 'BSPCE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
        }),
    },
    {
      label: 'Activé · vide',
      group: '4.1',
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
      label: 'WEIGHTED · 60/40 (OK)',
      group: '4.1',
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
              metric: 'ESG_SCORE',
              comparisonOperator: '>=',
              targetValue: '70',
              targetUnit: 'pts',
            },
          ],
        }),
    },
    {
      label: 'WEIGHTED · 50/40 (KO)',
      group: '4.1',
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
              metric: 'ESG_SCORE',
              comparisonOperator: '>=',
              targetValue: '70',
              targetUnit: 'pts',
            },
          ],
        }),
    },
    {
      label: 'OR · 3 mixtes',
      group: '4.1',
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
              metric: 'REVENUE',
              comparisonOperator: '>',
              targetValue: '500000000',
              targetUnit: '€',
            },
          ],
        }),
    },

    // ----- Groupe 4.2 — branche NON_MARKET -----
    {
      label: '4.2 · EBITDA ≥ 50 M€',
      group: '4.2',
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
              id: uuid('nm-ebitda'),
              name: 'EBITDA cumulé ≥ 50 M€',
              conditionType: 'NON_MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              metric: 'EBITDA',
              comparisonOperator: '>=',
              targetValue: '50000000',
              targetUnit: '€',
            },
          ],
        }),
    },
    {
      label: '4.2 · ARR > 10 M€ + seuils 50/120',
      group: '4.2',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'ANNUAL',
          failureAction: 'PARTIAL',
          conditions: [
            {
              id: uuid('nm-arr'),
              name: 'ARR > 10 M€ avec scoring partiel',
              conditionType: 'NON_MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              metric: 'ARR',
              comparisonOperator: '>',
              targetValue: '10000000',
              targetUnit: '€',
              thresholdMin: '50',
              thresholdMax: '120',
            },
          ],
        }),
    },
    {
      label: '4.2 · NPS = 50 pts',
      group: '4.2',
      apply: () =>
        applyPreset({
          planType: 'AGA',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('nm-nps'),
              name: 'NPS = 50 pts',
              conditionType: 'NON_MARKET',
              category: 'OPERATIONAL',
              weight: 100,
              enablePartialScoring: false,
              metric: 'NPS',
              comparisonOperator: '=',
              targetValue: '50',
              targetUnit: 'pts',
            },
          ],
        }),
    },
    {
      label: '4.2 · CARBON ≤ 1000 tCO2',
      group: '4.2',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'CONTINUOUS',
          failureAction: 'PARTIAL',
          conditions: [
            {
              id: uuid('nm-carbon'),
              name: 'Empreinte carbone ≤ 1000 tCO2',
              conditionType: 'NON_MARKET',
              category: 'ESG',
              weight: 100,
              enablePartialScoring: true,
              metric: 'CARBON',
              comparisonOperator: '<=',
              targetValue: '1000',
              targetUnit: 'tCO2',
            },
          ],
        }),
    },
    {
      label: '4.2 · CUSTOM unité libre',
      group: '4.2',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('nm-custom'),
              name: 'Score qualité interne ≥ 4.5/5',
              conditionType: 'NON_MARKET',
              category: 'STRATEGIC',
              weight: 100,
              enablePartialScoring: true,
              metric: 'CUSTOM',
              comparisonOperator: '>=',
              targetValue: '4.5',
              targetUnit: '/5',
            },
          ],
        }),
    },
    {
      label: '4.2 · KO · champs vides',
      group: '4.2',
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
              id: uuid('nm-empty'),
              name: 'Condition vide (errors visibles)',
              conditionType: 'NON_MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              // metric / comparisonOperator / targetValue tous vides
            },
          ],
        }),
    },
    {
      label: '4.2 · KO · USERS sans unité',
      group: '4.2',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('nm-users-ko'),
              name: 'USERS ≥ 1M sans unité',
              conditionType: 'NON_MARKET',
              category: 'OPERATIONAL',
              weight: 100,
              enablePartialScoring: true,
              metric: 'USERS',
              comparisonOperator: '>=',
              targetValue: '1000000',
              // targetUnit: '' → erreur Zod attendue
            },
          ],
        }),
    },
    {
      label: '4.2 · KO · seuils min > max',
      group: '4.2',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: true,
          combinationType: 'AND',
          evaluationMoment: 'END',
          failureAction: 'FORFEIT',
          conditions: [
            {
              id: uuid('nm-th-ko'),
              name: 'Seuils inversés',
              conditionType: 'NON_MARKET',
              category: 'FINANCIAL',
              weight: 100,
              enablePartialScoring: true,
              metric: 'EBITDA',
              comparisonOperator: '>=',
              targetValue: '10000000',
              targetUnit: '€',
              thresholdMin: '80',
              thresholdMax: '60',
            },
          ],
        }),
    },
  ];

  const presets41 = presets.filter((p) => p.group === '4.1');
  const presets42 = presets.filter((p) => p.group === '4.2');
  const presets43 = presets.filter((p) => p.group === '4.3');
  const presets44 = presets.filter((p) => p.group === '4.4');

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-muted-foreground font-mono text-xs uppercase">/dev — sandbox</p>
        <h1 className="text-2xl font-semibold tracking-tight">Step 4 — Performance (4.4)</h1>
        <p className="text-muted-foreground text-sm">
          Squelette (4.1) + NON_MARKET (4.2) + SERVICE (4.3) + MARKET basique (4.4 : SHARE_PRICE /
          TSR_ABS). Les sous-types TSR_REL_INDEX (4.5) et TSR_REL_PEERS (4.6/4.7) restent
          désactivés. Un changement de type via l’UI purge automatiquement les champs orphelins
          (shouldUnregister + cleanConditionForType).
        </p>
      </header>

      <PresetGroup title="Squelette (4.1)" presets={presets41} />
      <PresetGroup title="Branche NON_MARKET (4.2)" presets={presets42} />
      <PresetGroup title="Branche SERVICE (4.3)" presets={presets43} />
      <PresetGroup title="Branche MARKET basique (4.4)" presets={presets44} />

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

function PresetGroup({ title, presets }: { title: string; presets: Preset[] }) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{title}</p>
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
    </div>
  );
}
