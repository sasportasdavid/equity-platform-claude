'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  AlertTriangle,
  Boxes,
  Calculator,
  GitBranch,
  History,
  LineChart as LineIcon,
  Sigma,
  TrendingUp,
  Users,
  UserMinus,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CONDITION_CATEGORY_UI_LABELS,
  CONDITION_TYPE_UI_LABELS,
  LEAVER_TREATMENT_UI_LABELS,
  LEAVER_TYPE_UI_LABELS,
  type WizardLeaverType,
  type WizardLeaverTreatment,
} from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorialSynthesisTab } from '@/components/plans/detail/EditorialSynthesisTab';
import type { PlanDetail } from '@/server/queries/plans';

/**
 * Vue détail complète d'un plan — 8 onglets.
 *
 * Composant client pour les Tabs (Base UI nécessite client side). Toutes
 * les données viennent en props depuis le Server Component (page.tsx).
 *
 * Onglets :
 *   1. Synthèse        : KPIs + graphique cumul vesting
 *   2. État (snapshot) : pool size/allocated/vested/exercised/cancelled
 *   3. Performance     : conditions avec poids, payout curves
 *   4. IFRS 2          : placeholder « À venir B5 »
 *   5. Hypothèses      : liste des hypothesis_sets
 *   6. Départs         : 8 cards par leaver_type
 *   7. Versions        : lineage version 1, 2, ...
 *   8. Attributions    : placeholder « Module 3b »
 */
export function PlanDetailClient({
  detail,
  canUpdate: _canUpdate,
  planAwards,
}: {
  detail: PlanDetail;
  canUpdate: boolean;
  planAwards?: ReadonlyArray<import('@/server/queries/awards').AwardListRow>;
}) {
  const warnings = useMemo(() => {
    const raw = detail.plan.compliance_warnings as Array<{
      message?: string;
      severity?: string;
      code?: string;
    }> | null;
    return Array.isArray(raw) ? raw : [];
  }, [detail.plan.compliance_warnings]);

  return (
    <div className="space-y-4">
      {warnings.length > 0 ? <WarningsBanner warnings={warnings} /> : null}

      <Tabs defaultValue="synthesis" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="synthesis" data-testid="tab-synthesis">
            <LineIcon className="mr-1.5 size-3.5" /> Synthèse
          </TabsTrigger>
          <TabsTrigger value="snapshot" data-testid="tab-snapshot">
            <Boxes className="mr-1.5 size-3.5" /> État
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">
            <TrendingUp className="mr-1.5 size-3.5" /> Performance
          </TabsTrigger>
          <TabsTrigger value="ifrs2" data-testid="tab-ifrs2">
            <Sigma className="mr-1.5 size-3.5" /> IFRS 2
          </TabsTrigger>
          <TabsTrigger value="hypotheses" data-testid="tab-hypotheses">
            <Calculator className="mr-1.5 size-3.5" /> Hypothèses
          </TabsTrigger>
          <TabsTrigger value="leavers" data-testid="tab-leavers">
            <UserMinus className="mr-1.5 size-3.5" /> Départs
          </TabsTrigger>
          <TabsTrigger value="versions" data-testid="tab-versions">
            <GitBranch className="mr-1.5 size-3.5" /> Versions
          </TabsTrigger>
          <TabsTrigger value="grants" data-testid="tab-grants">
            <Users className="mr-1.5 size-3.5" /> Attributions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="synthesis">
          <EditorialSynthesisTab detail={detail} planAwards={planAwards ?? []} />
        </TabsContent>
        <TabsContent value="snapshot">
          <SnapshotTab detail={detail} />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceTab detail={detail} />
        </TabsContent>
        <TabsContent value="ifrs2">
          <Ifrs2Tab detail={detail} />
        </TabsContent>
        <TabsContent value="hypotheses">
          <HypothesesTab detail={detail} />
        </TabsContent>
        <TabsContent value="leavers">
          <LeaversTab detail={detail} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsTab detail={detail} />
        </TabsContent>
        <TabsContent value="grants">
          <PlaceholderTab
            icon={<Users className="size-10" />}
            title="Attributions individuelles"
            description="Liste des bénéficiaires et de leurs droits. Disponible en Module 3b (gestion des grants)."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet 1 — Synthèse : remplacé par EditorialSynthesisTab (Étape 13).
// L'ancien composant SynthesisTab a été supprimé, ainsi que ses imports
// orphelins (LineChart Recharts, KpiCard locale, formatDateShort).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Card « Valorisation » : supprimée Étape 14 (cleanup QA polish).
// L'ancien composant `ValuationCard` était orphelin depuis l'Étape 13
// (refonte Synthesis tab → EditorialSynthesisTab qui n'utilise pas
// cette carte). Si une vue valorisation est nécessaire à l'avenir,
// la lien `RunValuationButton` du PageShell pointe déjà vers
// /dashboard/plans/[id]/valuations/[runId].
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Onglet 2 — État du pool
// ---------------------------------------------------------------------------
function SnapshotTab({ detail }: { detail: PlanDetail }) {
  const p = detail.plan;
  const remaining = p.pool_size - p.pool_allocated;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard label="Pool total" value={p.pool_size.toLocaleString('fr-FR')} />
      <KpiCard label="Alloué" value={p.pool_allocated.toLocaleString('fr-FR')} />
      <KpiCard label="Restant" value={remaining.toLocaleString('fr-FR')} />
      <KpiCard label="Vested" value={p.pool_vested.toLocaleString('fr-FR')} />
      <KpiCard label="Exercé" value={p.pool_exercised.toLocaleString('fr-FR')} />
      <KpiCard label="Annulé" value={p.pool_cancelled.toLocaleString('fr-FR')} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet 3 — Performance conditions
// ---------------------------------------------------------------------------
function PerformanceTab({ detail }: { detail: PlanDetail }) {
  if (detail.conditions.length === 0) {
    return (
      <PlaceholderTab
        icon={<TrendingUp className="size-10" />}
        title="Aucune condition de performance"
        description="Ce plan a été créé sans conditions de performance. Les attributions sont soumises uniquement au calendrier de vesting."
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        {detail.conditions.length} condition{detail.conditions.length > 1 ? 's' : ''} · Combinaison{' '}
        <span className="font-mono">{detail.plan.performance_combination_type}</span> · Évaluation à{' '}
        <span className="font-mono">{detail.plan.performance_evaluation_moment}</span> · Échec →{' '}
        <span className="font-mono">{detail.plan.performance_failure_action}</span>
      </p>
      {detail.conditions.map((c) => (
        <Card key={c.id} data-testid={`detail-condition-${c.id}`}>
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{c.name ?? '(sans nom)'}</CardTitle>
              {c.weight != null ? (
                <Badge variant="outline" className="font-mono">
                  {c.weight} %
                </Badge>
              ) : null}
            </div>
            <CardDescription className="flex flex-wrap gap-2">
              {c.condition_type ? (
                <Badge variant="secondary">
                  {(CONDITION_TYPE_UI_LABELS as Record<string, string>)[c.condition_type] ??
                    c.condition_type}
                </Badge>
              ) : null}
              {c.category ? (
                <Badge variant="outline">
                  {(CONDITION_CATEGORY_UI_LABELS as Record<string, string>)[c.category] ??
                    c.category}
                </Badge>
              ) : null}
              {c.market_metric_type ? (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {c.market_metric_type}
                </Badge>
              ) : null}
              {c.metric ? (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {c.metric}
                </Badge>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            {c.target_value ? (
              <KvRow
                label="Cible"
                value={`${c.comparison_operator ?? ''} ${c.target_value} ${c.target_unit ?? ''}`.trim()}
              />
            ) : null}
            {c.threshold_min != null ? (
              <KvRow label="Seuil min" value={`${c.threshold_min} %`} />
            ) : null}
            {c.threshold_max != null ? (
              <KvRow label="Seuil max" value={`${c.threshold_max} %`} />
            ) : null}
            {c.performance_start_date ? (
              <KvRow label="Début mesure" value={formatDate(c.performance_start_date)} />
            ) : null}
            {c.performance_end_date ? (
              <KvRow label="Fin mesure" value={formatDate(c.performance_end_date)} />
            ) : null}
            {c.measurement_period_years != null ? (
              <KvRow
                label="Période (années)"
                value={Number(c.measurement_period_years).toFixed(2)}
              />
            ) : null}
            {c.reference_index_display_name ? (
              <KvRow label="Indice" value={c.reference_index_display_name} />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet 4 — IFRS 2 (calcul de charge)
//
// Affiche le calendrier IFRS 2 généré par compute-ifrs2-expense (B5.6) :
// total cumul, charge passée vs future (par rapport à today), tableau
// mensuel et LineChart cumul. État vide si aucun run n'a encore généré
// de calendrier.
// ---------------------------------------------------------------------------
function Ifrs2Tab({ detail }: { detail: PlanDetail }) {
  const ifrs2 = detail.latestIfrs2;
  const today = new Date().toISOString().slice(0, 10);

  const { cumulData, expensePast, expenseFuture } = useMemo(() => {
    if (!ifrs2) return { cumulData: [], expensePast: 0, expenseFuture: 0 };
    let cumul = 0;
    let past = 0;
    let future = 0;
    const data = ifrs2.periods.map((p) => {
      cumul += p.expenseAmount;
      if (p.periodEnd <= today) past += p.expenseAmount;
      else future += p.expenseAmount;
      return {
        date: p.periodStart,
        amount: p.expenseAmount,
        cumul: Math.round(cumul * 100) / 100,
      };
    });
    return { cumulData: data, expensePast: past, expenseFuture: future };
  }, [ifrs2, today]);

  if (!ifrs2) {
    return (
      <PlaceholderTab
        icon={<Sigma className="size-10" />}
        title="IFRS 2 — pas encore calculé"
        description="Lancez une valorisation pour générer le calendrier IFRS 2 (charge mensuelle étalée linéairement sur la période d'acquisition). Le calcul se déclenche automatiquement après chaque run de valorisation."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sigma className="size-4" />
            Charge IFRS 2 (étalement straight-line mensuel)
          </CardTitle>
          <CardDescription>
            Calculée le {formatDateTime(ifrs2.createdAt)} · {ifrs2.periods.length} période
            {ifrs2.periods.length > 1 ? 's' : ''} mensuelle{ifrs2.periods.length > 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              icon={<Sigma className="size-4" />}
              label="Charge totale"
              value={formatEur(ifrs2.totalExpense)}
              sub={`Pool × juste-valeur × P_non_market`}
            />
            <KpiCard
              icon={<History className="size-4" />}
              label="Charge passée"
              value={formatEur(expensePast)}
              sub="Périodes ≤ aujourd'hui"
            />
            <KpiCard
              icon={<TrendingUp className="size-4" />}
              label="Charge future projetée"
              value={formatEur(expenseFuture)}
              sub="Périodes > aujourd'hui"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cumul de la charge sur la période</CardTitle>
          <CardDescription>
            Évolution mois par mois jusqu&apos;à la fin du vesting de la dernière tranche.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cumulData.length > 0 ? (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                  {/* Bug fix 2026-05-05 : `hsl(var(--border))` invalide car
                      tokens DS V1 stockent les couleurs en HEX direct (pas
                      triplet HSL). Cf valuation-detail-client.tsx pour détails. */}
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 113, 108, 0.4)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d) => formatDateShort(d)}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k €`}
                  />
                  <RechartsTooltip
                    formatter={(value, name) => [
                      typeof value === 'number' ? formatEur(value) : value,
                      name === 'cumul' ? 'Cumul' : 'Période',
                    ]}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumul"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détail mensuel</CardTitle>
          <CardDescription>
            Un row par mois, charge constante par tranche (étalement linéaire). Total = somme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0 text-left text-xs uppercase">
                <tr>
                  <th className="text-muted-foreground px-3 py-2 font-medium">Période</th>
                  <th className="text-muted-foreground px-3 py-2 text-right font-medium">
                    Charge mensuelle
                  </th>
                  <th className="text-muted-foreground px-3 py-2 text-right font-medium">Cumul</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cumulData.map((row, i) => (
                  <tr key={i} className={row.date > today ? 'text-muted-foreground' : ''}>
                    <td className="px-3 py-2">{formatDate(row.date)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatEur(row.amount)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatEur(row.cumul)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatEur(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} €`;
}

// ---------------------------------------------------------------------------
// Onglet 5 — Hypothèses
// ---------------------------------------------------------------------------
function HypothesesTab({ detail }: { detail: PlanDetail }) {
  if (detail.hypothesisSets.length === 0) {
    return (
      <PlaceholderTab
        icon={<Calculator className="size-10" />}
        title="Aucune hypothèse"
        description="Les hypothèses (taux, volatilité, dividendes) seront créées au lancement de la première valorisation."
      />
    );
  }
  return (
    <div className="space-y-3">
      {detail.hypothesisSets.map((h) => (
        <Card key={h.id} data-testid={`detail-hypothesis-${h.id}`}>
          <CardHeader>
            <CardTitle className="text-base">Hypothèses du {formatDate(h.as_of_date)}</CardTitle>
            <CardDescription>
              Ticker {h.ticker_override ?? '—'} · Modèle {h.underlying_model ?? '—'} · Vol{' '}
              {h.vol_method ?? '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            <KvRow label="S₀ (sous-jacent)" value={h.s0?.toString() ?? '—'} />
            <KvRow
              label="Taux sans risque"
              value={h.rate_flat != null ? `${h.rate_flat} %` : '—'}
            />
            <KvRow
              label="Dividend yield"
              value={h.dividend_yield != null ? `${h.dividend_yield} %` : '—'}
            />
            <KvRow label="Volatilité" value={h.volatility != null ? `${h.volatility} %` : '—'} />
            <KvRow label="Devise" value={h.currency ?? '—'} />
            <KvRow
              label="Horizon (années)"
              value={h.time_horizon_years != null ? h.time_horizon_years.toString() : '—'}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet 6 — Départs (8 cards)
// ---------------------------------------------------------------------------
function LeaversTab({ detail }: { detail: PlanDetail }) {
  if (detail.leavers.length === 0) {
    return (
      <PlaceholderTab
        icon={<UserMinus className="size-10" />}
        title="Aucune règle de départ"
        description="Les règles par défaut (Standard FR Tech) seront appliquées par le moteur Monte Carlo."
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {detail.leavers.map((l) => (
        <Card key={l.id} data-testid={`detail-leaver-${l.leaver_type}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {(LEAVER_TYPE_UI_LABELS as Record<string, string>)[l.leaver_type] ?? l.leaver_type}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <p>
              <span className="text-muted-foreground">Traitement : </span>
              <span className="font-medium">
                {(LEAVER_TREATMENT_UI_LABELS as Record<WizardLeaverTreatment, string>)[
                  l.treatment as WizardLeaverTreatment
                ] ?? l.treatment}
              </span>
            </p>
            {l.acceleration_months != null ? (
              <p className="text-muted-foreground">
                Accél. : <span className="font-mono">{l.acceleration_months} mois</span>
              </p>
            ) : null}
            {l.exercise_window_days != null ? (
              <p className="text-muted-foreground">
                Fenêtre exercice : <span className="font-mono">{l.exercise_window_days} jours</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet 7 — Versions
// ---------------------------------------------------------------------------
function VersionsTab({ detail }: { detail: PlanDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" /> Historique des versions
        </CardTitle>
        <CardDescription>
          {detail.versions.length} version{detail.versions.length > 1 ? 's' : ''} · La duplication
          (qui crée une nouvelle version) arrive en B3.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {detail.versions.map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            data-testid={`detail-version-${v.version}`}
          >
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono">
                v{v.version}
              </Badge>
              {v.id === detail.plan.id ? (
                <span className="text-xs text-emerald-600">● actuelle</span>
              ) : (
                <Link
                  href={`/dashboard/plans/${v.id}`}
                  className="text-primary text-xs hover:underline"
                >
                  voir
                </Link>
              )}
              <span className="font-medium">{v.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={v.status} />
              <span className="text-muted-foreground text-xs">{formatDate(v.created_at)}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers de rendu
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  // Reuse du composant centralisé — import dynamique pour éviter une
  // boucle d'import circulaire (versions table needs status badge).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StatusBadge: Inner } = require('@/components/plans/shared/StatusBadge') as {
    StatusBadge: React.FC<{ status: string }>;
  };
  return <Inner status={status} />;
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {icon} {label}
        </p>
        <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
        {sub ? <p className="text-muted-foreground text-xs">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}

function PlaceholderTab({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="text-muted-foreground">{icon}</span>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground max-w-md text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

function WarningsBanner({
  warnings,
}: {
  warnings: Array<{ message?: string; severity?: string; code?: string }>;
}) {
  return (
    <Card
      data-testid="detail-warnings"
      className="border-amber-300/40 bg-amber-50/40 dark:bg-amber-950/20"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-600" />
          Avertissements de conformité
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {warnings.map((w, i) => (
          <p key={i} className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-mono text-xs">[{w.code ?? w.severity ?? '?'}]</span>{' '}
            {w.message ?? JSON.stringify(w)}
          </p>
        ))}
      </CardContent>
    </Card>
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
  // dd/MM/yy — gain de place pour l'axe X
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

// Suppress noisy unused — typed import for keeping reference
export type { WizardLeaverType };
