'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TaxBreakdown } from '@/lib/tax';
import { simulateExerciseTax } from '@/lib/tax';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TaxBreakdownDisplay } from './TaxBreakdownDisplay';
import { computeMaxUnitsAvailable, formatEuro, formatUnits } from './format-helpers';

type Props = {
  awardId: string;
  awardNumber: string | null;
  planType: string;
  planName: string;
  attributionDate: string | null;
  strikePrice: number;
  unitsGranted: number;
  unitsExercised: number;
  vestingSnapshot: unknown;
  fmvAtExercise: number;
  hireDate: string | null;
};

const PRICE_SCENARIOS = [0.5, 0.75, 1, 1.5, 2] as const;

/**
 * Module 9 B3 — Tax simulator standalone.
 *
 * Permet d'explorer 5 scénarios de prix de cession (50/75/100/150/200 %
 * de la FMV courante) sans créer de demande. Bouton final pour rebondir
 * vers le form `/portal/awards/[id]/exercise/new` avec query params
 * pré-remplis.
 */
export function TaxSimulator({
  awardId,
  awardNumber,
  planType,
  planName,
  attributionDate,
  strikePrice,
  unitsGranted,
  unitsExercised,
  vestingSnapshot,
  fmvAtExercise,
  hireDate,
}: Props) {
  const router = useRouter();

  const maxUnits = useMemo(
    () => computeMaxUnitsAvailable(unitsGranted, unitsExercised, vestingSnapshot),
    [unitsGranted, unitsExercised, vestingSnapshot],
  );

  const [units, setUnits] = useState<number>(maxUnits);
  const [tmiRate, setTmiRate] = useState<0 | 11 | 30 | 41 | 45>(30);
  const [selectedScenario, setSelectedScenario] = useState<number>(1);

  const cessionPrice = fmvAtExercise * selectedScenario;

  const breakdown: TaxBreakdown | null = useMemo(() => {
    if (units <= 0 || planType === 'AGA') return null;

    const result = simulateExerciseTax({
      planType: planType as 'BSPCE' | 'STOCK_OPTION' | 'BSA' | 'AGA',
      attributionDate: attributionDate ? new Date(attributionDate) : new Date(),
      exerciseDate: new Date(),
      cessionDate: new Date(),
      hireDate: hireDate ? new Date(hireDate) : undefined,
      unitsToExercise: units,
      strikePrice,
      fmvAtExercise,
      fmvAtCession: cessionPrice,
      tmiMode: 'manual',
      manualTmiRate: tmiRate,
    });
    return result.ok ? result.data : null;
  }, [
    planType,
    attributionDate,
    hireDate,
    units,
    strikePrice,
    fmvAtExercise,
    cessionPrice,
    tmiRate,
  ]);

  // Données comparatives sur tous les scénarios
  const allScenariosData = useMemo(() => {
    if (units <= 0 || planType === 'AGA') return [];

    return PRICE_SCENARIOS.map((multiplier) => {
      const result = simulateExerciseTax({
        planType: planType as 'BSPCE' | 'STOCK_OPTION' | 'BSA' | 'AGA',
        attributionDate: attributionDate ? new Date(attributionDate) : new Date(),
        exerciseDate: new Date(),
        cessionDate: new Date(),
        hireDate: hireDate ? new Date(hireDate) : undefined,
        unitsToExercise: units,
        strikePrice,
        fmvAtExercise,
        fmvAtCession: fmvAtExercise * multiplier,
        tmiMode: 'manual',
        manualTmiRate: tmiRate,
      });
      return {
        multiplier,
        cessionPrice: fmvAtExercise * multiplier,
        breakdown: result.ok ? result.data : null,
      };
    });
  }, [units, planType, attributionDate, hireDate, strikePrice, fmvAtExercise, tmiRate]);

  function handleCreateRequest() {
    const params = new URLSearchParams({
      units: String(units),
      cessionPrice: String(cessionPrice),
    });
    router.push(`/portal/awards/${awardId}/exercise/new?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="border-paper-300 bg-paper-50 rounded-lg border p-6">
        <p className="text-overline text-brass-500">SIMULATION · LIBRE</p>
        <h2 className="text-h2 text-ink-900 mt-1 font-medium">
          {awardNumber ?? 'Award'} — Simulateur fiscal
        </h2>
        <p className="text-ink-500 mt-2 text-sm">
          {planName} · {planType} · prix d'exercice {formatEuro(strikePrice)}
        </p>
        <p className="text-ink-500 mt-1 text-sm">
          {formatUnits(maxUnits)} {maxUnits > 1 ? 'unités disponibles' : 'unité disponible'}
          {' · '}FMV courante {formatEuro(fmvAtExercise)}
        </p>
      </header>

      {/* Inputs */}
      <section className="space-y-6">
        <header>
          <p className="text-overline text-brass-500">PARAMÈTRES · DE LA SIMULATION</p>
          <h3 className="text-h4 text-ink-900 mt-1">Ajustez les variables pour explorer</h3>
        </header>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sim-units">Unités à exercer</Label>
            <Input
              id="sim-units"
              type="number"
              min={1}
              max={maxUnits}
              value={units}
              onChange={(e) => setUnits(Math.min(Number(e.target.value), maxUnits))}
              data-testid="simulator-units-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sim-tmi">TMI</Label>
            <select
              id="sim-tmi"
              value={tmiRate}
              onChange={(e) => setTmiRate(Number(e.target.value) as 0 | 11 | 30 | 41 | 45)}
              className="border-paper-300 bg-paper-50 text-ink-900 focus:border-brass-500 h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value={0}>0 %</option>
              <option value={11}>11 %</option>
              <option value={30}>30 %</option>
              <option value={41}>41 %</option>
              <option value={45}>45 %</option>
            </select>
          </div>
        </div>

        {/* Scenario selector — bar chart de comparaison */}
        <div>
          <Label className="text-overline text-ink-500 mb-3 block">
            SCÉNARIOS · DE PRIX DE CESSION (% DE LA FMV)
          </Label>
          <div className="grid grid-cols-5 gap-2">
            {PRICE_SCENARIOS.map((mult) => {
              const data = allScenariosData.find((d) => d.multiplier === mult);
              const active = selectedScenario === mult;
              return (
                <button
                  key={mult}
                  type="button"
                  onClick={() => setSelectedScenario(mult)}
                  className={`group flex flex-col items-stretch rounded-md border p-3 text-left transition-colors ${
                    active
                      ? 'border-brass-500 bg-brass-50'
                      : 'border-paper-300 bg-paper-50 hover:bg-paper-100'
                  }`}
                  data-testid={`scenario-${Math.round(mult * 100)}`}
                >
                  <span className="text-overline text-ink-500">{Math.round(mult * 100)} %</span>
                  <span className="text-ink-900 mt-1 font-mono text-xs tabular-nums">
                    {formatEuro(fmvAtExercise * mult)}
                  </span>
                  {data?.breakdown && (
                    <span className="text-brass-700 mt-2 font-mono text-xs tabular-nums">
                      Net {formatEuro(data.breakdown.netGainAmount)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tax breakdown du scénario sélectionné */}
      {breakdown && (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">
              SCÉNARIO · {Math.round(selectedScenario * 100)} %
            </p>
            <h3 className="text-h4 text-ink-900 mt-1">
              Cession à {formatEuro(cessionPrice)} par unité
            </h3>
          </header>
          <TaxBreakdownDisplay breakdown={breakdown} />
        </section>
      )}

      {/* CTA */}
      <footer className="border-paper-300 flex flex-col items-stretch gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-500 text-xs">
          Cette simulation n'engage pas. Cliquez ci-dessous pour démarrer une vraie demande
          d'exercice avec ces paramètres.
        </p>
        <Button onClick={handleCreateRequest} data-testid="simulator-cta-create">
          Créer une demande basée sur cette simulation
        </Button>
      </footer>
    </div>
  );
}
