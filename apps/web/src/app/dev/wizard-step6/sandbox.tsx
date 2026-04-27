'use client';

import { FormProvider, useForm, type Resolver, type UseFormReset } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { planWizardSchema, type PlanWizardData } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Step6Valuation } from '@/components/plans/wizard/steps/Step6Valuation';

// Sérialiseur d'errors qui drop les `ref` circulaires de RHF.
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

export function WizardStep6Sandbox() {
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
    // Wipe complet : on passe `undefined` pour TOUS les fields step6
    // absents du préset, sinon RHF garde la valeur héritée du préset
    // précédent. On reconstruit l'objet à passer à reset() avec une
    // base "wiped" puis on overwrite avec les values du préset.
    const wipedStep6 = {
      ticker: undefined,
      companyTicker: undefined,
      underlyingPrice: undefined,
      currency: undefined,
      volMethod: undefined,
      volatility: undefined,
      volatilityWinsorizingPct: undefined,
      riskFreeRate: undefined,
      dividendYield: undefined,
      dividendInputMode: undefined,
      dividendAmount: undefined,
      lookbackDays: undefined,
      correlationOverride: undefined,
      modelChoice: undefined,
      underlyingModel: undefined,
      numPaths: undefined,
      stepsPerYear: undefined,
      useAntithetic: undefined,
      timeHorizonYears: undefined,
      hestonV0: undefined,
      hestonKappa: undefined,
      hestonTheta: undefined,
      hestonXi: undefined,
      hestonRho: undefined,
      jumpLambda: undefined,
      jumpMuJ: undefined,
      jumpSigmaJ: undefined,
    };
    reset({ ...wipedStep6, ...values } as PlanWizardData);
    await new Promise((r) => setTimeout(r, 0));
    await methods.trigger();
  }

  const presets: Array<{ label: string; apply: () => void }> = [
    {
      label: 'Standard CAC 40 (GBM)',
      apply: () =>
        applyPreset({
          planType: 'BSPCE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          underlyingPrice: 12.5,
          currency: 'EUR',
          ticker: '^FCHI',
          companyTicker: 'MC.PA',
          volMethod: 'HISTORICAL',
          volatility: 32,
          volatilityPriceType: 'CLOSE',
          volatilityWinsorizingPct: 0,
          riskFreeRate: 3.5,
          dividendYield: 2,
          dividendInputMode: 'percent',
          lookbackDays: 1095,
          modelChoice: 'auto',
          underlyingModel: 'GBM',
          numPaths: 50000,
          stepsPerYear: 12,
          useAntithetic: true,
          timeHorizonYears: 4,
        }),
    },
    {
      label: 'Tech US (HESTON)',
      apply: () =>
        applyPreset({
          planType: 'STOCK_OPTION',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          underlyingPrice: 200,
          currency: 'USD',
          ticker: '^GSPC',
          companyTicker: 'AAPL',
          volMethod: 'IMPLIED',
          volatility: 28,
          riskFreeRate: 4.2,
          dividendYield: 0.5,
          dividendInputMode: 'percent',
          modelChoice: 'monte_carlo',
          underlyingModel: 'HESTON',
          numPaths: 100000,
          stepsPerYear: 52,
          useAntithetic: true,
          timeHorizonYears: 5,
          hestonV0: 0.0784,
          hestonKappa: 2.0,
          hestonTheta: 0.0784,
          hestonXi: 0.3,
          hestonRho: -0.5,
        }),
    },
    {
      label: 'BSPCE FR + dividende absolu',
      apply: () =>
        applyPreset({
          planType: 'BSPCE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          underlyingPrice: 5,
          currency: 'EUR',
          volMethod: 'MANUAL',
          volatility: 45,
          riskFreeRate: 3.5,
          dividendYield: 0,
          dividendInputMode: 'amount',
          dividendAmount: 0.15,
          modelChoice: 'auto',
          underlyingModel: 'GBM',
          numPaths: 50000,
          stepsPerYear: 12,
          useAntithetic: true,
          timeHorizonYears: 7,
        }),
    },
    {
      label: 'JUMP_DIFFUSION (Merton)',
      apply: () =>
        applyPreset({
          planType: 'PERFORMANCE_SHARE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          underlyingPrice: 100,
          currency: 'EUR',
          volMethod: 'MANUAL',
          volatility: 30,
          riskFreeRate: 3,
          dividendYield: 1,
          dividendInputMode: 'percent',
          modelChoice: 'monte_carlo',
          underlyingModel: 'JUMP_DIFFUSION',
          numPaths: 100000,
          stepsPerYear: 252,
          useAntithetic: true,
          timeHorizonYears: 3,
          jumpLambda: 0.1,
          jumpMuJ: -0.05,
          jumpSigmaJ: 0.15,
        }),
    },
    {
      label: 'KO · HESTON paramètres manquants',
      apply: () =>
        applyPreset({
          planType: 'STOCK_OPTION',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          underlyingPrice: 100,
          currency: 'EUR',
          volMethod: 'MANUAL',
          volatility: 30,
          riskFreeRate: 3,
          dividendYield: 1,
          dividendInputMode: 'percent',
          modelChoice: 'monte_carlo',
          underlyingModel: 'HESTON',
          numPaths: 50000,
          stepsPerYear: 12,
          useAntithetic: true,
          timeHorizonYears: 4,
          // hestonX volontairement absents → 5 erreurs
        }),
    },
    {
      label: 'KO · dividende mode amount sans valeur',
      apply: () =>
        // Note : `reset()` de RHF n'efface PAS les fields absents du
        // `values` passé. On doit explicitement passer
        // `dividendAmount: undefined` pour purger une valeur héritée
        // d'un préset précédent (notamment BSPCE FR + dividende absolu).
        applyPreset({
          planType: 'BSPCE',
          grantDate: '2026-01-01',
          hasPerformanceConditions: false,
          underlyingPrice: 10,
          currency: 'EUR',
          volMethod: 'MANUAL',
          volatility: 35,
          riskFreeRate: 3.5,
          dividendYield: 0,
          dividendInputMode: 'amount',
          dividendAmount: undefined,
          modelChoice: 'auto',
          underlyingModel: 'GBM',
          numPaths: 50000,
          stepsPerYear: 12,
          useAntithetic: true,
          timeHorizonYears: 4,
        }),
    },
  ];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-muted-foreground font-mono text-xs uppercase">/dev — sandbox</p>
        <h1 className="text-2xl font-semibold tracking-tight">Step 6 — Valuation</h1>
        <p className="text-muted-foreground text-sm">
          Paramètres Monte Carlo : sous-jacent / volatilité / taux & dividendes / modèle (GBM /
          HESTON / JUMP_DIFFUSION). Les sections HESTON et JUMP_DIFFUSION n&apos;apparaissent que si
          le modèle correspondant est sélectionné.
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
        <Step6Valuation />
      </FormProvider>

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Form state (debug)</summary>
        <pre className="mt-2 overflow-x-auto text-[10px] leading-tight">
          {JSON.stringify(
            {
              isValid: methods.formState.isValid,
              errorKeys: Object.keys(methods.formState.errors),
              errors: serializeErrors(methods.formState.errors),
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
