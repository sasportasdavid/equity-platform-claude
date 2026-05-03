'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CalendarClock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { LeaverScenarioResult } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  getAvailableLeaverTypes,
  getLeaverTypeLabel,
  getTreatmentDescription,
  getTreatmentLabel,
  getTreatmentTone,
} from '@/lib/portal/leavers';
import { simulateLeaverScenario } from '@/server/actions/portal';

/**
 * Module 8 B4 — Simulateur de départ pour le portail bénéficiaire (§4.3
 * section 3 + §5.2).
 *
 * Client Component avec form (date + leaver_type) + affichage résultat
 * via Server Action `simulateLeaverScenario` qui appelle le RPC
 * SECURITY DEFINER côté DB.
 *
 * Sécurité (cf. §10) :
 *   - On ne montre JAMAIS le `leaverRulesSnapshot` complet : le snapshot
 *     est passé UNIQUEMENT pour limiter le dropdown aux leaver_types
 *     définis dans le contrat.
 *   - Aucun treatment / acceleration_months n'est exposé avant simulation.
 *
 * UX :
 *   - Disclaimer permanent en bas du résultat.
 *   - Date dans le passé : disclaimer subtil.
 *   - Couleur du résultat selon treatment (negative/neutral/positive).
 *   - Mobile-first : grid 1 col → 2 cols sur sm+.
 */
export function LeaverSimulator({
  awardId,
  planType,
  leaverRulesSnapshot,
  unitsGranted,
}: {
  awardId: string;
  planType: string;
  leaverRulesSnapshot: unknown;
  unitsGranted: number;
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
      <Card>
        <CardContent className="space-y-2 p-6">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Sparkles className="size-4" />
            <span>Aucune règle de départ n&apos;est définie sur cette attribution.</span>
          </div>
        </CardContent>
      </Card>
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

  return (
    <Card data-testid="portal-leaver-simulator">
      <CardContent className="space-y-6 p-6">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="text-primary size-4" />
            Simulateur de départ
          </h3>
          <p className="text-muted-foreground text-sm">
            Découvrez l&apos;impact d&apos;un départ hypothétique sur vos unités attribuées.
          </p>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="leaver-date" className="text-xs">
              Date de départ envisagée
            </Label>
            <Input
              id="leaver-date"
              type="date"
              value={terminationDate}
              onChange={(e) => {
                setTerminationDate(e.target.value);
                setResult(null);
              }}
              disabled={pending}
              data-testid="leaver-date-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="leaver-type" className="text-xs">
              Motif de départ
            </Label>
            <select
              id="leaver-type"
              value={leaverType}
              onChange={(e) => {
                setLeaverType(e.target.value);
                setResult(null);
              }}
              disabled={pending}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1"
              data-testid="leaver-type-select"
            >
              <option value="">— Choisir un motif —</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {getLeaverTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isPastDate ? (
          <p className="text-muted-foreground text-xs">
            Cette date est dans le passé. La simulation reste hypothétique.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onSimulate}
            disabled={formIncomplete || pending}
            data-testid="leaver-simulate-button"
          >
            {pending ? 'Simulation…' : 'Simuler'}
          </Button>
        </div>

        {/* Result */}
        {result ? (
          <div
            className={cn(
              'space-y-4 rounded-md border p-4 sm:p-5',
              tone === 'negative' &&
                'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
              tone === 'positive' &&
                'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
              tone === 'neutral' && 'border-border/40 bg-muted/30',
            )}
            data-testid="leaver-result"
          >
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Si vous quittez le {formatLongDate(result.termination_date)} (
                {getLeaverTypeLabel(result.leaver_type)}) :
              </p>
              <p
                className={cn(
                  'text-base font-semibold',
                  tone === 'negative' && 'text-red-700 dark:text-red-300',
                  tone === 'positive' && 'text-emerald-700 dark:text-emerald-300',
                )}
              >
                {getTreatmentLabel(result.treatment)}
              </p>
              <p className="text-muted-foreground text-xs">
                {getTreatmentDescription(result.treatment)}
              </p>
            </div>

            <ul className="space-y-1.5 text-sm">
              <ResultRow
                label="Acquises au moment du départ"
                value={`${formatNumber(result.units_already_vested)} unités`}
              />
              {result.units_accelerated > 0 ? (
                <ResultRow
                  label={
                    result.acceleration_months > 0 && result.treatment === 'accelerate'
                      ? `Accélérées (${result.acceleration_months} mois)`
                      : 'Accélérées'
                  }
                  value={`+${formatNumber(result.units_accelerated)} unités`}
                  positive
                />
              ) : null}
              {result.units_forfeited > 0 ? (
                <ResultRow
                  label="Perdues"
                  value={`−${formatNumber(result.units_forfeited)} unités`}
                  negative
                />
              ) : null}
              <li className="border-border/40 flex items-baseline justify-between gap-3 border-t pt-2 font-medium">
                <span>Total après départ</span>
                <span className="tabular-nums">
                  {formatNumber(result.units_total_after_leave)} unités
                  <span className="text-muted-foreground ml-1 text-xs">
                    / {formatNumber(unitsGranted)}
                  </span>
                </span>
              </li>
            </ul>

            {isOptionPlan && result.exercise_deadline ? (
              <div
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3',
                  result.exercise_window_days < 90
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                    : 'border-border/40 bg-background',
                )}
              >
                <CalendarClock
                  className={cn(
                    'size-4 shrink-0',
                    result.exercise_window_days < 90
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground',
                  )}
                />
                <div className="space-y-0.5 text-sm">
                  <p className="font-medium">
                    Date limite d&apos;exercice : {formatLongDate(result.exercise_deadline)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {result.exercise_window_days} jours après le départ
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Disclaimer permanent */}
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border-l-2 px-3 py-2',
            'border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20',
          )}
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground text-xs leading-relaxed">
            Cette simulation est indicative. Les conditions réelles dépendent de votre contrat et de
            l&apos;avis de la société.
          </p>
        </div>
      </CardContent>
    </Card>
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
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tabular-nums',
          positive && 'text-emerald-700 dark:text-emerald-300',
          negative && 'text-red-700 dark:text-red-300',
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
