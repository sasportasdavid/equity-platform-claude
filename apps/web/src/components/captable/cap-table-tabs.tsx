'use client';

/**
 * Module 10 B4 + B6 — Tabs view sur la page principale `/dashboard/captable`.
 *
 * 4 tabs disponibles :
 *   - Tableau (CapTableMatrix)
 *   - Camembert (EditorialPieChart par share_class)
 *   - Waterfall (EditorialWaterfall — top 10 stakeholders)
 *   - Évolution (CapTableEvolutionChart — réactivé B6 dès qu'on a 2+ snapshots)
 */

import { useState } from 'react';
import { LineChart, PieChart as PieIcon, Table2, TrendingUp } from 'lucide-react';
import type { CapTablePosition } from '@/server/queries/cap-table';
import { CapTableMatrix } from './cap-table-matrix';
import { CapTableEvolutionChart, type CapTableEvolutionProps } from './evolution-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorialPieChart } from '@/components/charts/editorial-pie-chart';
import { EditorialWaterfall } from '@/components/charts/editorial-waterfall';

export type CapTableTabsProps = {
  positions: CapTablePosition[];
  totalsByClass: Record<string, number>;
  grandTotal: number;
  evolution?: CapTableEvolutionProps;
};

function buildPieData(totalsByClass: Record<string, number>) {
  return Object.entries(totalsByClass)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

function buildWaterfallData(
  positions: CapTablePosition[],
): Array<{ label: string; value: number; type: 'positive' | 'total' }> {
  // Top 10 stakeholders par units, agrégés par stakeholder_name
  const byStakeholder = new Map<string, number>();
  for (const p of positions) {
    const key = p.stakeholder_name;
    byStakeholder.set(key, (byStakeholder.get(key) ?? 0) + p.units);
  }
  const sorted = Array.from(byStakeholder.entries()).sort((a, b) => b[1] - a[1]);
  const top10 = sorted.slice(0, 10);
  const othersTotal = sorted.slice(10).reduce((sum, [, v]) => sum + v, 0);

  const data: Array<{ label: string; value: number; type: 'positive' | 'total' }> = top10.map(
    ([label, value]) => ({ label, value, type: 'positive' as const }),
  );
  if (othersTotal > 0) {
    data.push({ label: 'Autres', value: othersTotal, type: 'positive' });
  }
  data.push({
    label: 'Total',
    value: data.reduce((sum, d) => sum + d.value, 0),
    type: 'total' as const,
  });
  return data;
}

export function CapTableTabs({
  positions,
  totalsByClass,
  grandTotal,
  evolution,
}: CapTableTabsProps) {
  const [tab, setTab] = useState('table');
  const pieData = buildPieData(totalsByClass);
  const waterfallData = buildWaterfallData(positions);

  const evolutionDisabled = !evolution || evolution.points.length < 2;
  const evolutionTitle = evolutionDisabled
    ? `Au moins 2 snapshots requis (${evolution?.points.length ?? 0} disponible${(evolution?.points.length ?? 0) > 1 ? 's' : ''})`
    : `${evolution.points.length} snapshots`;

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList>
        <TabsTrigger value="table">
          <Table2 className="mr-1 size-4" />
          Tableau
        </TabsTrigger>
        <TabsTrigger value="pie">
          <PieIcon className="mr-1 size-4" />
          Camembert
        </TabsTrigger>
        <TabsTrigger value="waterfall">
          <TrendingUp className="mr-1 size-4" />
          Waterfall
        </TabsTrigger>
        <TabsTrigger value="evolution" disabled={evolutionDisabled} title={evolutionTitle}>
          <LineChart className="mr-1 size-4" />
          Évolution
        </TabsTrigger>
      </TabsList>

      <TabsContent value="table" className="mt-4">
        <CapTableMatrix
          positions={positions}
          totalsByClass={totalsByClass}
          grandTotal={grandTotal}
        />
      </TabsContent>

      <TabsContent value="pie" className="mt-4">
        <EditorialPieChart
          data={pieData}
          showLegend
          centerLabel={{
            primary: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(
              grandTotal,
            ),
            secondary: 'units total',
          }}
          unit=" u."
        />
      </TabsContent>

      <TabsContent value="waterfall" className="mt-4">
        <EditorialWaterfall data={waterfallData} unit=" u." height={400} />
      </TabsContent>

      {evolution ? (
        <TabsContent value="evolution" className="mt-4">
          <CapTableEvolutionChart
            points={evolution.points}
            classTypes={evolution.classTypes}
            rounds={evolution.rounds}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
