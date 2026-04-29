'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, CheckCircle2, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

/**
 * Onglet Vesting — Module 3b B4.
 *
 * Composé de :
 *  1. Timeline Recharts LineChart : units cumulés "Programmé" (gris pointillé)
 *     + "Acquis" (vert) en fonction de scheduled_date
 *  2. Table des vesting_events avec status badge + multiplier perf
 *
 * Pas de bouton "Forcer le vesting" exposé en V1 — feature flag
 * ENABLE_VESTING_FORCE non exposée côté UI (sera ajoutée si besoin debug).
 * Le cron Module 1 `recalc-vesting` automatisera le passage PENDING → VESTED
 * quand scheduled_date <= today.
 */
export function AwardVestingTab({
  detail,
  canModify: _canModify,
}: {
  detail: AwardDetailRow;
  canModify: boolean;
}) {
  const { vestingEvents } = detail;

  // Données chart : pour chaque event, somme cumulée Programmé vs Acquis.
  // Pattern reduce avec tuple [accProgrammé, accAcquis, rows] pour ne pas
  // muter de let après render (React 19 / react-compiler).
  const chartData = useMemo(() => {
    const result = vestingEvents.reduce<{
      accP: number;
      accV: number;
      rows: Array<{ date: string; Programmé: number; Acquis: number }>;
    }>(
      (acc, ev) => {
        const toVest = Number(ev.units_to_vest);
        const newP = acc.accP + toVest;
        const newV =
          ev.status === 'VESTED' ? acc.accV + Number(ev.units_vested ?? toVest) : acc.accV;
        return {
          accP: newP,
          accV: newV,
          rows: [...acc.rows, { date: ev.scheduled_date, Programmé: newP, Acquis: newV }],
        };
      },
      { accP: 0, accV: 0, rows: [] },
    );
    return result.rows;
  }, [vestingEvents]);

  if (vestingEvents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vesting non matérialisé</CardTitle>
          <CardDescription>
            Les événements de vesting sont générés au passage en GRANTED. Tant que l&apos;award
            n&apos;est pas attribué, aucune tranche n&apos;apparaît ici.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4" />
            Timeline du vesting
          </CardTitle>
          <CardDescription>
            {vestingEvents.length} tranche{vestingEvents.length > 1 ? 's' : ''} — units cumulés
            programmés vs acquis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d) => formatDateShort(d)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  formatter={(value) => Number(value).toLocaleString('fr-FR')}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Line
                  type="monotone"
                  dataKey="Programmé"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Acquis"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-slate-400" /> Programmé
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-emerald-500" /> Acquis
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="size-4" />
            Détail des tranches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Date programmée</th>
                  <th className="px-3 py-2 font-medium">Date effective</th>
                  <th className="px-3 py-2 text-right font-medium">À acquérir</th>
                  <th className="px-3 py-2 text-right font-medium">Multiplier perf.</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Notif</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vestingEvents.map((ev, idx) => (
                  <tr key={ev.id}>
                    <td className="px-3 py-2 font-mono text-xs">#{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">{formatDate(ev.scheduled_date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {ev.effective_date ? (
                        formatDate(ev.effective_date)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(ev.units_to_vest).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {ev.performance_multiplier != null ? (
                        `× ${Number(ev.performance_multiplier).toFixed(2)}`
                      ) : (
                        <span className="text-muted-foreground">×1.00</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <VestingStatusBadge status={ev.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {ev.notification_sent_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="size-3" />
                          Envoyée
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-muted-foreground mt-3 border-t pt-2 text-xs">
            <Zap className="mr-1 inline size-3" />
            Le passage automatique PENDING → VESTED arrive avec le cron Module 1 `recalc-vesting`
            (déclenché quotidiennement). Pas d&apos;action manuelle V1.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function VestingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: 'En attente',
      className: 'bg-muted text-muted-foreground border-border',
    },
    VESTED: {
      label: 'Acquis',
      className:
        'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100',
    },
    FORFEITED: {
      label: 'Confisqué',
      className: 'bg-destructive/10 text-destructive border-destructive/30',
    },
    CANCELLED: {
      label: 'Annulé',
      className: 'bg-destructive/10 text-destructive border-destructive/30',
    },
  };
  const cfg = map[status] ?? map.PENDING!;
  return (
    <Badge variant="outline" className={`${cfg.className} font-medium`}>
      {cfg.label}
    </Badge>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m || !m[1] || !m[2] || !m[3]) return iso;
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}
