'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Hourglass,
  Layers,
  LineChart as LineIcon,
  Sigma,
  TrendingUp,
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ValuationDetail } from '@/server/queries/valuations';

/**
 * Page détail d'un run de valorisation. Affiche tout ce que le moteur Python
 * a renvoyé : juste-valeur + IC + std error, breakdown par tranche, sample
 * paths simulés (si Monte Carlo), sensitivities (si compute_greeks=true), et
 * audit trail JSON brut pour debug avancé.
 *
 * Sections (de haut en bas, par ordre d'importance utilisateur) :
 *   1. KPIs principaux (fair_value, std_error, IC 95 %, vesting_probability)
 *   2. Tranche details si multi-tranches OU si single avec valeurs
 *      (utile pour comprendre comment le total est composé)
 *   3. Sample paths Recharts si distribution_stats.debug_paths non null
 *      (Monte Carlo uniquement — pas de paths en BS analytique)
 *   4. Sensitivities (Greeks) si présents
 *   5. Audit trail collapsible (raw JSON pour les analystes)
 */
export function ValuationDetailClient({ detail }: { detail: ValuationDetail }) {
  const { run, result } = detail;

  // États pas encore terminés
  if (run.status === 'QUEUED' || run.status === 'RUNNING') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hourglass className="size-4 animate-pulse" />
            Calcul en cours
          </CardTitle>
          <CardDescription>
            Le moteur Python est en train de valoriser ce plan. Recharger la page dans quelques
            secondes pour voir les résultats.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (run.status === 'ERROR' || !result) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2 text-base">
            <AlertCircle className="size-4" />
            Erreur de calcul
          </CardTitle>
          <CardDescription>
            {run.errorMessage ??
              'Le moteur a échoué sans message d’erreur. Voir les logs Edge Function pour analyse.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fv = result.fairValuePerInstrument;
  const fvLabel = fv != null ? `${fv.toFixed(4)} €` : '—';
  const stdLabel = result.stdError != null ? `± ${result.stdError.toFixed(4)}` : null;
  const ciLabel =
    result.ci95Low != null && result.ci95High != null
      ? `${result.ci95Low.toFixed(2)} – ${result.ci95High.toFixed(2)} €`
      : null;

  return (
    <div className="space-y-4">
      <KpisRow
        fvLabel={fvLabel}
        stdLabel={stdLabel}
        ciLabel={ciLabel}
        pricerUsed={run.pricerUsed}
        engineVersion={run.engineVersion}
        durationMs={computeDurationMs(run.startedAt, run.completedAt)}
      />

      <TrancheDetailsCard distributionStats={result.distributionStats} />

      <SamplePathsCard distributionStats={result.distributionStats} />

      <SensitivitiesCard sensitivities={result.sensitivities} />

      <MarketSnapshotCard snapshot={result.marketDataSnapshot} />

      <AuditTrailCard distributionStats={result.distributionStats} auditData={result.auditData} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. KPIs principaux
// ---------------------------------------------------------------------------
function KpisRow({
  fvLabel,
  stdLabel,
  ciLabel,
  pricerUsed,
  engineVersion,
  durationMs,
}: {
  fvLabel: string;
  stdLabel: string | null;
  ciLabel: string | null;
  pricerUsed: string | null;
  engineVersion: string | null;
  durationMs: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sigma className="size-4" />
          Juste-valeur IFRS 2
          <Badge variant="outline" className="ml-2 font-mono text-xs">
            {engineVersion ?? 'V8'}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">
            {pricerUsed ?? 'BLACK_SCHOLES'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Juste-valeur unitaire du sous-jacent (norme IFRS 2 §16-22) — sans filtre vesting /
          conditions service.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={<Sigma className="size-4" />}
            label="Juste-valeur unitaire"
            value={fvLabel}
            sub={stdLabel ?? undefined}
          />
          <Kpi
            icon={<TrendingUp className="size-4" />}
            label="Intervalle confiance 95 %"
            value={ciLabel ?? '—'}
            sub={ciLabel ? 'low – high' : 'pas d’IC en mode BS analytique'}
          />
          <Kpi
            icon={<CheckCircle2 className="size-4" />}
            label="Pricer"
            value={pricerUsed ?? '—'}
            sub={engineVersion ? `engine ${engineVersion}` : undefined}
          />
          <Kpi
            icon={<CalendarClock className="size-4" />}
            label="Durée"
            value={durationMs != null ? `${(durationMs / 1000).toFixed(2)} s` : '—'}
            sub="end-to-end (Edge ↔ Python ↔ DB)"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Tranche details
// ---------------------------------------------------------------------------
type TrancheDetail = {
  tranche_id: number;
  time: number;
  portion: number;
  fair_value: number;
  market_only_value: number;
  avg_payout_weighted: number;
  vesting_probability_real: number;
};

function TrancheDetailsCard({ distributionStats }: { distributionStats: unknown }) {
  const tranches = useMemo(() => extractTranches(distributionStats), [distributionStats]);
  if (tranches.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4" />
          Détail par tranche
        </CardTitle>
        <CardDescription>
          Décomposition du fair_value total par tranche de vesting. `market_only_value` est la
          juste-valeur IFRS 2 (utilisée), `fair_value` est la valeur cash-flow filtrée.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b text-left text-xs uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Année</th>
                <th className="px-3 py-2 text-right font-medium">Portion</th>
                <th className="px-3 py-2 text-right font-medium">Market only (IFRS 2)</th>
                <th className="px-3 py-2 text-right font-medium">Payout pondéré</th>
                <th className="px-3 py-2 text-right font-medium">Vesting prob.</th>
                <th className="px-3 py-2 text-right font-medium">Fair value (filtré)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tranches.map((t) => (
                <tr key={t.tranche_id}>
                  <td className="px-3 py-2 font-mono text-xs">#{t.tranche_id}</td>
                  <td className="px-3 py-2">{t.time.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{(t.portion * 100).toFixed(0)} %</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {t.market_only_value.toFixed(4)} €
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(t.avg_payout_weighted * 100).toFixed(1)} %
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(t.vesting_probability_real * 100).toFixed(1)} %
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right font-mono">
                    {t.fair_value.toFixed(4)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Sample paths (Monte Carlo seulement)
// ---------------------------------------------------------------------------
function SamplePathsCard({ distributionStats }: { distributionStats: unknown }) {
  const paths = useMemo(() => extractSamplePaths(distributionStats), [distributionStats]);

  // Recharts attend une row par point t, avec une colonne par path. On
  // transforme [path[t]] en [{ t, p0, p1, ..., pN }]. Le useMemo doit
  // venir AVANT tout early return (Rules of Hooks).
  const chartData = useMemo(() => {
    if (paths.length === 0) return [];
    const maxLen = Math.max(...paths.map((p) => p.length));
    return Array.from({ length: maxLen }, (_, t) => {
      const row: Record<string, number> = { t };
      paths.forEach((p, i) => {
        const v = p[t];
        if (v != null) row[`p${i}`] = v;
      });
      return row;
    });
  }, [paths]);

  if (paths.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LineIcon className="size-4" />
          Trajectoires Monte Carlo (échantillon)
        </CardTitle>
        <CardDescription>
          {paths.length} trajectoires sur {chartData.length} pas de temps. Aperçu visuel — la
          distribution complète a été calculée sur des dizaines de milliers de paths.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              {/*
                Bug fix 2026-05-05 : `hsl(var(--primary) / 0.3)` était CSS invalide
                car `--primary = var(--brass-500) = #b8865b` (HEX direct, pas triplet
                HSL). Résultat : `stroke=""` rendu par Recharts → 50 lignes invisibles
                avec axes seuls. Fix : couleurs RGBA directes du token brass-500
                (#b8865b → rgb(184, 134, 91)) avec opacité gérée explicitement.
                Voir `apps/web/src/app/globals.css:161` pour la valeur HEX source.
              */}
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 113, 108, 0.4)" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 11 }}
                label={{ value: 'pas', position: 'insideBottom', offset: -2, fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                formatter={(v) => (typeof v === 'number' ? v.toFixed(2) : v)}
                labelFormatter={(t) => `t = ${t}`}
              />
              {paths.map((_, i) => (
                <Line
                  key={i}
                  type="monotone"
                  dataKey={`p${i}`}
                  stroke="rgba(184, 134, 91, 0.3)"
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Sensitivities (Greeks)
// ---------------------------------------------------------------------------
function SensitivitiesCard({ sensitivities }: { sensitivities: unknown }) {
  const greeks = useMemo(() => extractGreeks(sensitivities), [sensitivities]);
  if (!greeks) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Sensibilités (Greeks)</CardTitle>
          <CardDescription>
            Pas de Greeks calculés. Activer `compute_greeks=true` côté payload pour les obtenir
            (B5.7).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sensibilités (Greeks)</CardTitle>
        <CardDescription>
          Variation de la juste-valeur pour un mouvement infinitésimal des paramètres marché.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(greeks).map(([k, v]) => (
            <Kpi key={k} label={k.toUpperCase()} value={v.toFixed(4)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. Market data snapshot
// ---------------------------------------------------------------------------
function MarketSnapshotCard({ snapshot }: { snapshot: unknown }) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Snapshot marché au moment du calcul</CardTitle>
        <CardDescription>
          Inputs marché « gelés » au moment du run pour audit / replay déterministe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="bg-muted/40 max-h-72 overflow-auto rounded p-3 font-mono text-xs">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Audit trail (JSON raw collapsible)
// ---------------------------------------------------------------------------
function AuditTrailCard({
  distributionStats,
  auditData,
}: {
  distributionStats: unknown;
  auditData: unknown;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="hover:bg-muted/30 -m-2 flex w-full items-center gap-2 rounded p-2 text-left"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <div>
            <CardTitle className="text-base">Audit trail (raw JSON)</CardTitle>
            <CardDescription>
              Données complètes renvoyées par le moteur — pour analystes et debug.
            </CardDescription>
          </div>
        </button>
      </CardHeader>
      {open ? (
        <CardContent>
          <div className="space-y-3">
            <section>
              <h4 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                distribution_stats
              </h4>
              <pre className="bg-muted/40 max-h-96 overflow-auto rounded p-3 font-mono text-xs">
                {JSON.stringify(distributionStats, null, 2)}
              </pre>
            </section>
            <section>
              <h4 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                audit_data
              </h4>
              <pre className="bg-muted/40 max-h-48 overflow-auto rounded p-3 font-mono text-xs">
                {JSON.stringify(auditData, null, 2)}
              </pre>
            </section>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Kpi({
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
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div> : null}
    </div>
  );
}

function computeDurationMs(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const s = Date.parse(startedAt);
  const e = Date.parse(completedAt);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return e - s;
}

function extractTranches(distributionStats: unknown): TrancheDetail[] {
  if (!distributionStats || typeof distributionStats !== 'object') return [];
  const td = (distributionStats as { tranche_details?: unknown }).tranche_details;
  if (!Array.isArray(td)) return [];
  return td.filter(
    (x): x is TrancheDetail =>
      x != null &&
      typeof x === 'object' &&
      typeof (x as TrancheDetail).tranche_id === 'number' &&
      typeof (x as TrancheDetail).time === 'number',
  );
}

function extractSamplePaths(distributionStats: unknown): number[][] {
  if (!distributionStats || typeof distributionStats !== 'object') return [];
  const dp = (distributionStats as { debug_paths?: unknown }).debug_paths;
  if (!Array.isArray(dp)) return [];
  // Format attendu : Array<Array<number>> — on filtre defensively les
  // entrées non conformes et on cap à 50 paths pour la viz (le moteur
  // peut en envoyer plus).
  const valid = dp.filter(
    (p): p is number[] => Array.isArray(p) && p.every((n) => typeof n === 'number'),
  );
  return valid.slice(0, 50);
}

function extractGreeks(sensitivities: unknown): Record<string, number> | null {
  if (!sensitivities || typeof sensitivities !== 'object') return null;
  const entries = Object.entries(sensitivities as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}
