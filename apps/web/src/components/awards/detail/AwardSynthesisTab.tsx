'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Coins,
  Euro,
  GitMerge,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AwardStatusBadge } from '@/components/awards/AwardStatusBadge';
import { AwardRowActions } from '@/components/awards/AwardRowActions';
import type { AwardDetailRow } from '@/server/queries/awards';
import type { AwardStatus } from '@equity/shared';

/**
 * Onglet Synthèse — Module 3b B4.
 *
 * 3 cartes côte à côte :
 *  1. Quantités : bar chart horizontal stacké + breakdown texte
 *  2. Dates clés : grant/vesting_start/expiry/acceptance_deadline/accepted_at/granted_at/cancelled_at
 *  3. Valorisation : strike + fair_value (placeholder si non valorisé)
 *
 * Card Workflow en dessous : status courant + transitions disponibles
 * (réutilise AwardRowActions de B3 pour les boutons cancel/forfeit/transition).
 */
export function AwardSynthesisTab({
  detail,
  canCancel,
  canModify,
  canPropose,
}: {
  detail: AwardDetailRow;
  canCancel: boolean;
  canModify: boolean;
  canPropose: boolean;
}) {
  const { award, stats } = detail;
  const status = award.status as AwardStatus;

  // Bar chart data : 1 row stacked en 4 catégories
  const chartData = useMemo(
    () => [
      {
        name: 'Total',
        Acquis: stats.totalVested,
        Exercé: stats.totalExercised,
        'En cours': stats.totalOutstanding,
        Annulé: stats.totalCancelled,
      },
    ],
    [stats],
  );

  // Compliance warnings stockés à la transition PROPOSED (B7) — soft only,
  // les hard errors bloquent et ne sont jamais persistés.
  const complianceWarnings = useMemo(() => {
    const raw = award.compliance_warnings;
    if (!Array.isArray(raw)) return [];
    return raw as Array<{ severity?: string; code?: string; message?: string }>;
  }, [award.compliance_warnings]);

  return (
    <div className="space-y-4">
      {/* Row 1 : 3 cartes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <QuantitiesCard chartData={chartData} stats={stats} totalGranted={stats.totalGranted} />
        <DatesCard award={award} />
        <ValuationCard award={award} totalGranted={stats.totalGranted} />
      </div>

      {complianceWarnings.length > 0 ? (
        <ComplianceWarningsCard warnings={complianceWarnings} />
      ) : null}

      {/* Row 2 : Workflow */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitMerge className="size-4" />
            Workflow
          </CardTitle>
          <CardDescription>
            Statut courant et actions disponibles (réutilise les transitions de la liste).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm">Statut :</span>
          <AwardStatusBadge status={status} />
          <span className="text-muted-foreground ml-auto text-xs">
            Cliquez sur le menu actions ci-dessous pour transitionner :
          </span>
          <AwardRowActions
            awardId={award.id}
            status={status}
            canCancel={canCancel}
            canModify={canModify}
            canPropose={canPropose}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carte Quantités
// ---------------------------------------------------------------------------
function QuantitiesCard({
  chartData,
  stats,
  totalGranted,
}: {
  chartData: Array<Record<string, string | number>>;
  stats: AwardDetailRow['stats'];
  totalGranted: number;
}) {
  const segments = [
    { key: 'Acquis', color: '#10b981', value: stats.totalVested },
    { key: 'Exercé', color: '#0ea5e9', value: stats.totalExercised },
    { key: 'En cours', color: '#94a3b8', value: stats.totalOutstanding },
    { key: 'Annulé', color: '#f43f5e', value: stats.totalCancelled },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="size-4" />
          Quantités
        </CardTitle>
        <CardDescription>
          Total attribué : {totalGranted.toLocaleString('fr-FR')} units
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-12 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <XAxis type="number" hide domain={[0, totalGranted]} />
              <YAxis type="category" dataKey="name" hide />
              <RechartsTooltip
                formatter={(value) => Number(value).toLocaleString('fr-FR')}
                cursor={{ fill: 'transparent' }}
              />
              {segments.map((seg) => (
                <Bar key={seg.key} dataKey={seg.key} stackId="a" radius={2}>
                  <Cell fill={seg.color} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1.5 text-sm">
          {segments.map((seg) => {
            const pct = totalGranted > 0 ? Math.round((seg.value / totalGranted) * 100) : 0;
            return (
              <li key={seg.key} className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                <span className="flex-1">{seg.key}</span>
                <span className="font-mono tabular-nums">
                  {seg.value.toLocaleString('fr-FR')}{' '}
                  <span className="text-muted-foreground text-xs">({pct} %)</span>
                </span>
              </li>
            );
          })}
        </ul>
        {stats.vestingProgress > 0 ? (
          <div className="text-muted-foreground border-t pt-2 text-xs">
            <CheckCircle2 className="mr-1 inline size-3 text-emerald-500" />
            Progression vesting : <strong>{stats.vestingProgress} %</strong>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Carte Dates clés
// ---------------------------------------------------------------------------
function DatesCard({ award }: { award: AwardDetailRow['award'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="size-4" />
          Dates clés
        </CardTitle>
        <CardDescription>Historique du cycle de vie de l&apos;attribution</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <DateRow label="Date d'attribution" value={award.grant_date} />
          <DateRow label="Début vesting" value={award.vesting_start_date} />
          <DateRow label="Date d'expiration" value={award.expiry_date} />
          <DateRow label="Échéance d'acceptation" value={award.acceptance_deadline} />
          <DateRow label="Date d'acceptation" value={award.accepted_at} placeholder="En attente" />
          <DateRow label="Grant effectif" value={award.granted_at} placeholder="—" />
          {award.cancelled_at ? (
            <DateRow label="Annulé le" value={award.cancelled_at} placeholder="—" />
          ) : null}
          {award.cancellation_reason ? (
            <>
              <dt className="text-muted-foreground">Raison annulation</dt>
              <dd className="text-destructive text-xs">{award.cancellation_reason}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function DateRow({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{formatDate(value, placeholder)}</dd>
    </>
  );
}

// ---------------------------------------------------------------------------
// Carte Valorisation
// ---------------------------------------------------------------------------
function ValuationCard({
  award,
  totalGranted,
}: {
  award: AwardDetailRow['award'];
  totalGranted: number;
}) {
  const totalValue =
    award.total_fair_value ??
    (award.fair_value_per_unit != null ? award.fair_value_per_unit * totalGranted : null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Euro className="size-4" />
          Valorisation
        </CardTitle>
        <CardDescription>IFRS 2 — juste-valeur unitaire et totale</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Strike</dt>
          <dd className="font-mono">
            {award.exercise_price != null ? `${award.exercise_price.toFixed(2)} €` : '—'}
          </dd>
          <dt className="text-muted-foreground">Fair value / unit</dt>
          <dd className="font-mono">
            {award.fair_value_per_unit != null ? (
              `${award.fair_value_per_unit.toFixed(4)} €`
            ) : (
              <Badge variant="outline" className="font-normal">
                À valoriser
              </Badge>
            )}
          </dd>
          <dt className="text-muted-foreground">Valeur totale</dt>
          <dd className="font-mono">
            {totalValue != null
              ? `${totalValue.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
              : '—'}
          </dd>
        </dl>
        <div className="text-muted-foreground mt-3 border-t pt-2 text-xs">
          <TrendingUp className="mr-1 inline size-3" />
          La valorisation par award arrive en Module 11 (lien depuis le plan détail fonctionnel
          depuis Module 3a B5).
        </div>
      </CardContent>
    </Card>
  );
}

function ComplianceWarningsCard({
  warnings,
}: {
  warnings: Array<{ severity?: string; code?: string; message?: string }>;
}) {
  return (
    <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-amber-600" />
          Conformité — avertissements
        </CardTitle>
        <CardDescription>
          Avertissements soft (non-bloquants) émis à la soumission au workflow d&apos;approbation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {warnings.map((w, i) => (
            <li
              key={`${w.code}-${i}`}
              className="flex items-start gap-2"
              data-testid={`synthesis-compliance-warning-${w.code}`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="space-y-0.5">
                <p className="font-mono text-[10px] uppercase opacity-60">{w.code}</p>
                <p>{w.message}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string | null, placeholder = '—'): string {
  if (!iso) return placeholder;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
