'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TaxBreakdown } from '@/lib/tax';
import { simulateExerciseTax } from '@/lib/tax';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createExerciseRequest } from '@/server/actions/exercises';
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
  /** Préfill optionnel depuis tax-simulator. */
  prefillUnits?: number;
  prefillCessionPrice?: number;
};

/**
 * Module 9 B3 — Form principal de demande d'exercice.
 *
 * Composant client : preview live tax breakdown via simulateExerciseTax,
 * submit Server Action createExerciseRequest. Toggle cession concomitante
 * conditionne 2 champs supplémentaires (cessionDate + prixCession).
 */
export function ExerciseRequestForm({
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
  prefillUnits,
  prefillCessionPrice,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const maxUnits = useMemo(
    () => computeMaxUnitsAvailable(unitsGranted, unitsExercised, vestingSnapshot),
    [unitsGranted, unitsExercised, vestingSnapshot],
  );

  // État form
  const [units, setUnits] = useState<number>(Math.min(prefillUnits ?? maxUnits, maxUnits));
  const [tmiRate, setTmiRate] = useState<0 | 11 | 30 | 41 | 45>(30);
  const [cessionToggle, setCessionToggle] = useState<boolean>(prefillCessionPrice !== undefined);
  const [cessionDate, setCessionDate] = useState<string>(new Date().toISOString().split('T')[0]!);
  const [cessionPrice, setCessionPrice] = useState<number>(prefillCessionPrice ?? fmvAtExercise);
  const [notes, setNotes] = useState<string>('');

  // Tax breakdown live
  const breakdown: TaxBreakdown | null = useMemo(() => {
    if (units <= 0 || planType === 'AGA') return null;

    const result = simulateExerciseTax({
      planType: planType as 'BSPCE' | 'STOCK_OPTION' | 'BSA' | 'AGA',
      attributionDate: attributionDate ? new Date(attributionDate) : new Date(),
      exerciseDate: new Date(),
      cessionDate: cessionToggle ? new Date(cessionDate) : undefined,
      hireDate: hireDate ? new Date(hireDate) : undefined,
      unitsToExercise: units,
      strikePrice,
      fmvAtExercise,
      fmvAtCession: cessionToggle ? cessionPrice : undefined,
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
    tmiRate,
    cessionToggle,
    cessionDate,
    cessionPrice,
  ]);

  const totalExerciseCost = units * strikePrice;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createExerciseRequest({
        awardId,
        unitsToExercise: units,
        cessionToggle,
        cessionDate: cessionToggle ? new Date(cessionDate) : undefined,
        cessionPricePerUnit: cessionToggle ? cessionPrice : undefined,
        paymentMethod: 'BANK_TRANSFER',
        beneficiaryNotes: notes || undefined,
        taxSnapshot: breakdown,
      });

      if (result.ok) {
        router.push(`/portal/exercises/${result.exerciseRequestId}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Recap award */}
      <header className="border-paper-300 bg-paper-50 rounded-lg border p-6">
        <p className="text-overline text-brass-500">DEMANDE · D'EXERCICE</p>
        <h2 className="text-h2 text-ink-900 mt-1 font-medium">{awardNumber ?? 'Award'}</h2>
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
          <p className="text-overline text-brass-500">PARAMÈTRES · DE L'EXERCICE</p>
          <h3 className="text-h4 text-ink-900 mt-1">Configuration de la demande</h3>
        </header>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="units">Unités à exercer</Label>
            <Input
              id="units"
              type="number"
              min={1}
              max={maxUnits}
              value={units}
              onChange={(e) => setUnits(Math.min(Number(e.target.value), maxUnits))}
              required
              data-testid="form-units-input"
            />
            <p className="text-ink-500 text-xs">
              Max {formatUnits(maxUnits)} · Coût d'exercice {formatEuro(totalExerciseCost)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tmi">Tranche marginale d'imposition (TMI)</Label>
            <select
              id="tmi"
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

        {/* Cession toggle */}
        <div className="border-paper-300 rounded-md border p-4">
          <div className="flex items-center gap-3">
            <input
              id="cession-toggle"
              type="checkbox"
              checked={cessionToggle}
              onChange={(e) => setCessionToggle(e.target.checked)}
              className="text-brass-500 focus:ring-brass-500 border-paper-300 size-4 rounded"
              data-testid="form-cession-toggle"
            />
            <Label htmlFor="cession-toggle" className="text-ink-900 cursor-pointer">
              Je cède aussi mes actions immédiatement
            </Label>
          </div>
          <p className="text-ink-500 mt-2 text-xs">
            Activez si vous souhaitez simuler une cession concomitante (ex: vente secondaire, exit,
            IPO). La plus-value de cession sera ajoutée à la simulation fiscale.
          </p>

          {cessionToggle && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cession-date">Date de cession prévue</Label>
                <Input
                  id="cession-date"
                  type="date"
                  value={cessionDate}
                  onChange={(e) => setCessionDate(e.target.value)}
                  required={cessionToggle}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cession-price">Prix de cession unitaire (€)</Label>
                <Input
                  id="cession-price"
                  type="number"
                  step="0.01"
                  min={0}
                  value={cessionPrice}
                  onChange={(e) => setCessionPrice(Number(e.target.value))}
                  required={cessionToggle}
                />
                <p className="text-ink-500 text-xs">
                  Default = FMV courante {formatEuro(fmvAtExercise)}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optionnel)</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Contexte ou demandes particulières à transmettre à l'admin"
            className="border-paper-300 bg-paper-50 text-ink-900 focus:border-brass-500 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </section>

      {/* Tax breakdown live */}
      {breakdown && (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">CALCUL · FISCAL ESTIMÉ</p>
            <h3 className="text-h4 text-ink-900 mt-1">Estimation des impôts à payer</h3>
          </header>
          <TaxBreakdownDisplay breakdown={breakdown} />
        </section>
      )}

      {/* Submit */}
      <footer className="border-paper-300 flex items-center justify-between border-t pt-6">
        <p className="text-ink-500 text-xs">
          La demande sera soumise pour approbation selon le workflow configuré par l'organisation.
        </p>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={isPending || units <= 0 || units > maxUnits}
            data-testid="form-submit-button"
          >
            {isPending ? 'Envoi…' : 'Soumettre la demande'}
          </Button>
        </div>
      </footer>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-medium">Erreur</p>
          <p className="mt-1">{error}</p>
        </div>
      )}
    </form>
  );
}
