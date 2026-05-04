/**
 * Module 10 B4 — `dilution-comparator.tsx` (création initiale).
 *
 * Comparateur Avant / Après pour scénarios de dilution. 2 colonnes côte
 * à côte qui affichent chacune une `cap-table-matrix.tsx`. Header avec
 * deltas globaux par stakeholder_type (founders, investors, ESOP).
 *
 * Server Component (composant async pas requis ici, props static).
 *
 * V1 features :
 *   - 2 matrices Avant/Après (props CapTablePosition[] chacune)
 *   - Stats deltas : grand_total_units delta + breakdown par class_type
 *   - Highlight visuel rouge sur dilution >5%, vert si pas dilué
 *
 * V2 (B5+) : timeline interactif (curseur asof_date), violin plot stake×stake
 */

import type { CapTablePosition } from '@/server/queries/cap-table';
import { CapTableMatrix } from './cap-table-matrix';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function formatPercent(num: number): string {
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num) + ' %'
  );
}

function formatUnits(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Calcule les deltas par class_type entre Avant et Après.
 */
function computeDeltas(
  totalsBefore: Record<string, number>,
  totalsAfter: Record<string, number>,
): Array<{ classCode: string; before: number; after: number; delta: number; pctDelta: number }> {
  const allKeys = new Set([...Object.keys(totalsBefore), ...Object.keys(totalsAfter)]);
  return Array.from(allKeys)
    .map((classCode) => {
      const before = totalsBefore[classCode] ?? 0;
      const after = totalsAfter[classCode] ?? 0;
      const delta = after - before;
      const pctDelta = before > 0 ? (delta / before) * 100 : after > 0 ? 100 : 0;
      return { classCode, before, after, delta, pctDelta };
    })
    .sort((a, b) => b.after - a.after);
}

export type DilutionComparatorProps = {
  /** Positions actuelles (avant scénario). */
  beforePositions: CapTablePosition[];
  beforeTotalsByClass: Record<string, number>;
  beforeGrandTotal: number;
  /** Positions résultantes (après scénario appliqué). */
  afterPositions: CapTablePosition[];
  afterTotalsByClass: Record<string, number>;
  afterGrandTotal: number;
  /** Métadonnées du scénario pour le titre. */
  scenarioName: string;
  scenarioType: string;
};

export function DilutionComparator({
  beforePositions,
  beforeTotalsByClass,
  beforeGrandTotal,
  afterPositions,
  afterTotalsByClass,
  afterGrandTotal,
  scenarioName,
  scenarioType,
}: DilutionComparatorProps) {
  const deltas = computeDeltas(beforeTotalsByClass, afterTotalsByClass);
  const totalDelta = afterGrandTotal - beforeGrandTotal;
  const totalPctDelta = beforeGrandTotal > 0 ? (totalDelta / beforeGrandTotal) * 100 : 0;

  return (
    <div className="space-y-6" data-testid="dilution-comparator">
      {/* Header deltas globaux */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Comparaison — <span className="font-mono text-sm">{scenarioType}</span>
          </CardTitle>
          <CardDescription>{scenarioName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-muted-foreground text-overline">Total avant</div>
              <div className="font-mono text-2xl">{formatUnits(beforeGrandTotal)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-overline">Total après</div>
              <div className="font-mono text-2xl">{formatUnits(afterGrandTotal)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-overline">Évolution</div>
              <div className="flex items-baseline gap-2">
                <div
                  className={`font-mono text-2xl ${
                    totalDelta > 0
                      ? 'text-emerald-700'
                      : totalDelta < 0
                        ? 'text-red-700'
                        : 'text-muted-foreground'
                  }`}
                >
                  {totalDelta > 0 ? '+' : ''}
                  {formatUnits(totalDelta)}
                </div>
                <span className="text-muted-foreground text-xs">
                  ({totalPctDelta > 0 ? '+' : ''}
                  {formatPercent(totalPctDelta)})
                </span>
              </div>
            </div>
          </div>

          {/* Deltas par share_class */}
          {deltas.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="text-muted-foreground text-overline">Évolution par classe</div>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {deltas.map((d) => {
                  const isNew = d.before === 0 && d.after > 0;
                  const isRemoved = d.before > 0 && d.after === 0;
                  return (
                    <div
                      key={d.classCode}
                      className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
                    >
                      <span className="font-mono text-xs">{d.classCode}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-xs">
                          {formatUnits(d.before)} → {formatUnits(d.after)}
                        </span>
                        {isNew ? (
                          <Badge variant="default" className="text-xs">
                            Nouveau
                          </Badge>
                        ) : isRemoved ? (
                          <Badge variant="destructive" className="text-xs">
                            Retiré
                          </Badge>
                        ) : (
                          <span
                            className={`font-mono text-xs ${
                              d.delta > 0
                                ? 'text-emerald-700'
                                : d.delta < 0
                                  ? 'text-red-700'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {d.delta > 0 ? '+' : ''}
                            {formatPercent(d.pctDelta)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Matrices Avant / Après */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-2">
          <div className="text-overline text-muted-foreground">Avant scénario</div>
          <CapTableMatrix
            positions={beforePositions}
            totalsByClass={beforeTotalsByClass}
            grandTotal={beforeGrandTotal}
          />
        </div>
        <div className="space-y-2">
          <div className="text-overline text-brass-700">Après scénario</div>
          <CapTableMatrix
            positions={afterPositions}
            totalsByClass={afterTotalsByClass}
            grandTotal={afterGrandTotal}
          />
        </div>
      </div>
    </div>
  );
}
