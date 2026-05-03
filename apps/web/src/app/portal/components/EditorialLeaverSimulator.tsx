'use client';

import { useMemo, useState, useTransition } from 'react';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import type { LeaverScenarioResult } from '@equity/shared';
import {
  getAvailableLeaverTypes,
  getLeaverTypeLabel,
  getTreatmentDescription,
  getTreatmentLabel,
  getTreatmentTone,
} from '@/lib/portal/leavers';
import { simulateLeaverScenario } from '@/server/actions/portal';
import { cn } from '@/lib/utils';

/**
 * Editorial LeaverSimulator (Étape 14 Design System V1).
 *
 * Variante **semi-dark** (cf. arbitrage user) :
 *   - Card extérieure `bg-ink-900` + texte `paper-50` (signature dark
 *     Editorial Finance pour ce module)
 *   - Zone form **paper-50 clair** pour ne pas casser l'utilisabilité
 *     du date picker natif et du select natif (pièges classiques en
 *     dark mode — Safari iOS particulier)
 *   - Résultat dans la card sombre avec phrase éditoriale dynamique
 *     en serif italic + valeur tabular-nums paper-50
 *
 * **Aucun calcul de gain en €** (interdit spec Module 8 §1111). Toute
 * la logique métier (Server Action, helpers, snapshot validation)
 * reste celle de `LeaverSimulator` legacy — ce composant est un
 * **rewrap visuel** sans modification de la logique business.
 */
// Note : `unitsGranted` est dans la signature publique (parité avec
// LeaverSimulator legacy + future utilisation pour afficher "X / total"
// dans le résultat) mais non destructuré ici car le calcul se fait
// côté RPC via simulateLeaverScenario. Pas de `_unitsGranted` lint-only.
export function EditorialLeaverSimulator({
  awardId,
  planType,
  leaverRulesSnapshot,
  orgName,
}: {
  awardId: string;
  planType: string;
  leaverRulesSnapshot: unknown;
  unitsGranted: number;
  /** Nom de l'org pour la phrase éditoriale "Si vous quittiez {orgName}..." */
  orgName: string;
}) {
  const availableTypes = useMemo(
    () => getAvailableLeaverTypes(leaverRulesSnapshot),
    [leaverRulesSnapshot],
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const [terminationDate, setTerminationDate] = useState<string>(todayIso);
  const [leaverType, setLeaverType] = useState<string>('');
  const [result, setResult] = useState<LeaverScenarioResult | null>(null);
  const [pending, startTransition] = useTransition();

  const isOptionPlan = planType === 'BSPCE' || planType === 'STOCK_OPTION' || planType === 'BSA';
  const formIncomplete = !terminationDate || !leaverType;
  const isPastDate = terminationDate < todayIso;

  if (availableTypes.length === 0) {
    return (
      <div className="bg-ink-900 text-paper-50 rounded-lg p-6">
        <p className="serif-italic text-paper-50/80 text-sm">
          Aucune règle de départ n&apos;est définie sur cette attribution.
        </p>
      </div>
    );
  }

  const onSimulate = () => {
    if (formIncomplete) return;
    startTransition(async () => {
      const res = await simulateLeaverScenario({
        awardId,
        leaverType,
        terminationDate,
      });
      if (res.ok) {
        setResult(res.result);
      } else {
        toast.error(res.error);
      }
    });
  };

  const tone = result ? getTreatmentTone(result.treatment) : 'neutral';
  const leaverTypeLabel = leaverType ? getLeaverTypeLabel(leaverType) : null;

  return (
    <div
      className="bg-ink-900 text-paper-50 rounded-lg p-6 sm:p-8"
      data-testid="portal-leaver-simulator-editorial"
    >
      {/* Header — overline + phrase éditoriale dynamique */}
      <header className="space-y-3">
        <p className="text-overline text-brass-500">SIMULATION DE DÉPART · WHAT-IF</p>
        <p className="serif-italic text-paper-50 max-w-2xl text-base leading-relaxed sm:text-lg">
          Si vous quittiez {orgName} le{' '}
          <span className="text-brass-500">{formatLongDate(terminationDate)}</span>
          {leaverTypeLabel ? (
            <>
              {' '}
              en tant que <span className="text-brass-500">{leaverTypeLabel.toLowerCase()}</span>
            </>
          ) : null}
          ...
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(220px,1fr)]">
        {/* Zone form — fond paper-50 clair pour utilisabilité native (variante semi-dark) */}
        <div className="bg-paper-50 text-ink-900 space-y-4 rounded-md p-4 sm:p-5">
          <p className="text-overline text-ink-500">PARAMÈTRES · DE LA SIMULATION</p>

          <div className="space-y-1.5">
            <label
              htmlFor="editorial-leaver-date"
              className="text-ink-700 block text-xs font-medium"
            >
              Date de départ envisagée
            </label>
            <input
              id="editorial-leaver-date"
              type="date"
              value={terminationDate}
              onChange={(e) => {
                setTerminationDate(e.target.value);
                setResult(null);
              }}
              disabled={pending}
              className="border-paper-300 bg-paper-50 text-ink-900 focus:ring-brass-500 focus:border-brass-500 h-9 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
              data-testid="editorial-leaver-date-input"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="editorial-leaver-type"
              className="text-ink-700 block text-xs font-medium"
            >
              Motif de départ
            </label>
            <select
              id="editorial-leaver-type"
              value={leaverType}
              onChange={(e) => {
                setLeaverType(e.target.value);
                setResult(null);
              }}
              disabled={pending}
              className="border-paper-300 bg-paper-50 text-ink-900 focus:ring-brass-500 focus:border-brass-500 h-9 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0"
              data-testid="editorial-leaver-type-select"
            >
              <option value="">— Choisir un motif —</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {getLeaverTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          {isPastDate ? (
            <p className="serif-italic text-ink-500 text-xs">
              Cette date est dans le passé. La simulation reste hypothétique.
            </p>
          ) : null}

          <button
            type="button"
            onClick={onSimulate}
            disabled={formIncomplete || pending}
            className="bg-brass-500 hover:bg-brass-700 text-paper-50 disabled:bg-paper-300 disabled:text-ink-400 mt-2 inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed"
            data-testid="editorial-leaver-simulate-button"
          >
            {pending ? 'Simulation…' : 'Simuler le scénario'}
          </button>
        </div>

        {/* Résultat — fond ink-900 (héritage de la card extérieure) */}
        <div
          className="border-paper-300/30 flex flex-col justify-center gap-3 rounded-md border-l p-4 sm:p-5"
          data-testid="editorial-leaver-result"
        >
          {result ? (
            <>
              <p className="text-overline text-brass-500">VOS UNITÉS NETTES</p>
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-numeric-xl text-paper-50 font-mono tabular-nums',
                    tone === 'negative' && 'text-title-500',
                    tone === 'positive' && 'text-bond-500',
                  )}
                >
                  {formatNumber(result.units_total_after_leave)}
                </span>
                <span className="text-paper-50/60 font-mono text-sm">u.</span>
              </div>
              <p className="serif-italic text-paper-50/80 text-sm leading-snug">
                {getTreatmentLabel(result.treatment)}
              </p>
              <p className="text-paper-50/60 text-xs leading-snug">
                {getTreatmentDescription(result.treatment)}
              </p>

              {/* Détail rows */}
              <ul className="border-paper-300/20 mt-2 space-y-1 border-t pt-2 text-xs">
                <ResultRow
                  label="Acquises au moment du départ"
                  value={formatNumber(result.units_already_vested)}
                />
                {result.units_accelerated > 0 ? (
                  <ResultRow
                    label={
                      result.acceleration_months > 0 && result.treatment === 'accelerate'
                        ? `Accélérées (${result.acceleration_months} mois)`
                        : 'Accélérées'
                    }
                    value={`+${formatNumber(result.units_accelerated)}`}
                    positive
                  />
                ) : null}
                {result.units_forfeited > 0 ? (
                  <ResultRow
                    label="Perdues"
                    value={`−${formatNumber(result.units_forfeited)}`}
                    negative
                  />
                ) : null}
              </ul>

              {isOptionPlan && result.exercise_deadline ? (
                <div
                  className={cn(
                    'mt-2 flex items-start gap-2 rounded p-2 text-xs',
                    result.exercise_window_days < 90
                      ? 'border-saffron-500/40 bg-saffron-500/10 border-l-[3px]'
                      : 'border-paper-300/20 border-l',
                  )}
                >
                  <CalendarClock
                    className={cn(
                      'size-3.5 shrink-0',
                      result.exercise_window_days < 90 ? 'text-saffron-500' : 'text-paper-50/60',
                    )}
                  />
                  <div className="flex-1 leading-snug">
                    <p className="text-paper-50 font-medium">
                      Date limite d&apos;exercice : {formatLongDate(result.exercise_deadline)}
                    </p>
                    <p className="text-paper-50/60">
                      {result.exercise_window_days} jours après le départ
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-overline text-paper-50/40">VOS UNITÉS NETTES</p>
              <p className="text-numeric-xl text-paper-50/30 font-mono tabular-nums">—</p>
              <p className="serif-italic text-paper-50/50 text-sm leading-snug">
                Renseignez une date et un motif, puis lancez la simulation.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer permanent en bas */}
      <p className="text-paper-50/60 mt-6 font-mono text-xs leading-relaxed">
        ⚠ Cette simulation est indicative. Les conditions réelles dépendent de votre contrat et de
        l&apos;avis de la société. Aucun gain en € n&apos;est calculé ici (vue bénéficiaire V1).
      </p>
    </div>
  );
}

function ResultRow({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-paper-50/70">{label}</span>
      <span
        className={cn(
          'font-mono tabular-nums',
          positive && 'text-bond-500',
          negative && 'text-title-500',
          !positive && !negative && 'text-paper-50',
        )}
      >
        {value}
      </span>
    </li>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

function formatLongDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];
  const day = parseInt(iso.slice(8, 10), 10);
  const month = months[parseInt(iso.slice(5, 7), 10) - 1];
  const year = iso.slice(0, 4);
  return `${day} ${month} ${year}`;
}
