'use client';

/**
 * Module 10 B6 — Evolution chart (Tab "Évolution" de la page cap table).
 *
 * Line chart Recharts avec 1 ligne par class_type au fil du temps + marqueurs
 * verticaux sur funding_round.closed_at.
 *
 * Source de données : `cap_table_snapshots` (B6) — au moins 2 snapshots requis.
 * Si < 2 snapshots → empty state "Au moins 2 snapshots requis".
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type EvolutionPoint = {
  date: string;
  /** Total units par class_type (COMMON, PREFERRED, ESOP, etc) */
  [classType: string]: string | number;
};

export type FundingRoundMarker = {
  date: string;
  label: string;
};

export type CapTableEvolutionProps = {
  points: EvolutionPoint[];
  classTypes: string[];
  rounds: FundingRoundMarker[];
};

const CLASS_COLORS: Record<string, string> = {
  COMMON: '#6366f1', // indigo-500
  PREFERRED: '#10b981', // emerald-500
  ESOP: '#f59e0b', // amber-500
  WARRANT: '#ec4899', // pink-500
  BSPCE: '#8b5cf6', // violet-500
  OTHER: '#94a3b8', // slate-400
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

export function CapTableEvolutionChart({ points, classTypes, rounds }: CapTableEvolutionProps) {
  if (points.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Évolution de la cap table</CardTitle>
          <CardDescription>
            Au moins 2 snapshots sont requis pour visualiser l&apos;évolution dans le temps. Créez
            des snapshots manuels (les snapshots automatiques quotidiens arrivent en V1.5).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          {points.length === 0
            ? 'Aucun snapshot disponible.'
            : '1 snapshot disponible — ajoutez-en au moins un autre.'}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Évolution de la cap table</CardTitle>
        <CardDescription>
          Units totales par classe d&apos;actions sur les {points.length} snapshots.{' '}
          {rounds.length > 0
            ? `${rounds.length} levée${rounds.length > 1 ? 's' : ''} marquée${rounds.length > 1 ? 's' : ''} en pointillés.`
            : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#94a3b8"
              />
              <YAxis
                tickFormatter={formatNumber}
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#94a3b8"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
                labelFormatter={(label) => formatDate(String(label ?? ''))}
                formatter={(value) => formatNumber(Number(value ?? 0))}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              {classTypes.map((ct) => (
                <Line
                  key={ct}
                  type="monotone"
                  dataKey={ct}
                  stroke={CLASS_COLORS[ct] ?? '#94a3b8'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}

              {rounds.map((r, i) => (
                <ReferenceLine
                  key={`round-${i}`}
                  x={r.date}
                  stroke="#dc2626"
                  strokeDasharray="4 2"
                  label={{
                    value: r.label,
                    position: 'top',
                    fontSize: 10,
                    fill: '#dc2626',
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
