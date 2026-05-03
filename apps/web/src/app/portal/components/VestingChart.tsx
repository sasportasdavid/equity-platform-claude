'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeCumulativeUnits, type VestingTimelineEntry } from '@/lib/portal/vesting';

/**
 * Module 8 B3 — Vesting chart Recharts pour le portail bénéficiaire.
 *
 * 2 séries cumulatives :
 *   - "Vesting prévu" (gris pointillé)  : SUM(unitsToVest) à chaque tranche
 *   - "Vesting réalisé" (bleu plein)    : SUM(unitsVested), s'arrête au
 *                                         dernier point VESTED
 *
 * Reference line verticale rouge = "Aujourd'hui".
 *
 * Step interpolation (`stepAfter`) car le vesting est discret (par tranche),
 * pas continu.
 *
 * Le composant est `client` car Recharts utilise des hooks React + ResizeObserver.
 */
export function VestingChart({
  timeline,
  todayIso,
}: {
  timeline: VestingTimelineEntry[];
  /** ISO date `YYYY-MM-DD` pour la reference line. Permet override pour tests. */
  todayIso?: string;
}) {
  const chartData = useMemo(() => computeCumulativeUnits(timeline), [timeline]);

  const today = todayIso ?? new Date().toISOString().slice(0, 10);

  if (chartData.length === 0) {
    return (
      <div className="border-border/40 bg-muted/20 rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Pas de calendrier d&apos;acquisition disponible.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full md:h-[320px]" data-testid="portal-vesting-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatTickDate}
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickMargin={6}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            tickFormatter={formatNumber}
            width={48}
          />
          <RechartsTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const cum = payload.find((p) => p.dataKey === 'cumulative')?.value;
              const vested = payload.find((p) => p.dataKey === 'cumulativeVested')?.value;
              return (
                <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 font-medium">{formatTooltipDate(String(label))}</p>
                  <p className="text-muted-foreground">
                    Prévu :{' '}
                    <span className="text-foreground">{formatNumber(Number(cum) || 0)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Acquis :{' '}
                    <span className="text-foreground">{formatNumber(Number(vested) || 0)}</span>
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine
            x={today}
            stroke="var(--color-destructive)"
            strokeDasharray="4 4"
            label={{
              value: "Aujourd'hui",
              position: 'top',
              fill: 'var(--color-destructive)',
              fontSize: 10,
            }}
          />
          <Line
            type="stepAfter"
            dataKey="cumulative"
            name="Vesting prévu"
            stroke="var(--color-muted-foreground)"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="cumulativeVested"
            name="Vesting réalisé"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatTickDate(iso: string): string {
  // YYYY-MM-DD → MM/YY
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

function formatTooltipDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
}
