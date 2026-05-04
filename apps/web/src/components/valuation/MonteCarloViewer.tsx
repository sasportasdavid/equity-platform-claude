'use client';

/**
 * Module 11 B3 — `MonteCarloViewer.tsx`.
 *
 * Composant orchestrateur du viewer Monte Carlo. Reçoit la response complète
 * d'un valuation_run SUCCESS + les inputs originaux, organise l'affichage
 * editorial premium (cf MODULE_11 §4.2).
 *
 * Layout :
 *   - Header : titre éditorial + bouton "Relancer la simulation" (si callback)
 *   - ParametersCard (chips) — full width
 *   - PathsCanvas (h-96) — full width
 *   - 4 KPICards — grid 1/2/4 cols responsive
 *   - ConvergenceChart + PayoffHistogram — grid 1/2 cols
 *   - AuditPanel (collapsed) — full width
 */

import { RotateCw } from 'lucide-react';
import type { VisualizationPayload } from '@equity/shared';
import { ParametersCard, type ParametersCardProps } from './ParametersCard';
import { PathsCanvas } from './PathsCanvas';
import { ConvergenceChart, type ConvergencePoint } from './ConvergenceChart';
import { PayoffHistogram } from './PayoffHistogram';
import { AuditPanel } from './AuditPanel';
import { computeHitRate } from './helpers';

export type MonteCarloViewerProps = {
  /** Données du run (response moteur Python) */
  run: {
    fair_value_per_unit: number;
    std_error?: number;
    visualization: VisualizationPayload;
    greeks?: Record<string, number>;
    input_hash: string;
    engine_version: string;
    execution_time_ms: number;
    /** Optionnel : seed utilisé (pour reproducibilité audit) */
    seed?: number;
  };
  /** Inputs originaux du run (ce qu'on a envoyé au moteur) */
  inputs: ParametersCardProps;
  /** Callback "Relancer la simulation" — déclenche un nouveau call moteur */
  onRelaunch?: () => void;
  /** Active le replay cinématique au mount (animation 5s ease-out) */
  enableReplay?: boolean;
  /** Titre éditorial. Default : "Valorisation Monte Carlo" */
  title?: string;
  /** Sous-titre éditorial. Default : auto-construit depuis inputs */
  subtitle?: string;
};

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurPreciseFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const intFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pctFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * KPI card minimaliste pour Monte Carlo (pas de sparkline — on a des
 * scalaires, pas des séries temporelles). Réutilise les tokens éditoriaux
 * du DS V1 mais sans la signature sparkline qui caractérise `KPICard`
 * dashboard CFO.
 */
function MonteCarloKpi({
  label,
  value,
  subtitle,
  highlight,
  testId,
}: {
  label: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={`border-paper-300 rounded-md border p-3 ${highlight ? 'bg-brass-50 border-brass-300' : 'bg-paper-50'}`}
      data-testid={testId}
    >
      <div className="text-ink-500 text-overline">{label}</div>
      <div className={`mt-1 font-mono text-xl ${highlight ? 'text-brass-900' : 'text-ink-900'}`}>
        {value}
      </div>
      {subtitle ? <div className="text-ink-500 mt-0.5 text-xs">{subtitle}</div> : null}
    </div>
  );
}

export function MonteCarloViewer({
  run,
  inputs,
  onRelaunch,
  enableReplay = false,
  title = 'Valorisation Monte Carlo',
  subtitle,
}: MonteCarloViewerProps) {
  const viz = run.visualization;

  // ConvergenceChart attend un format strict — coerce le record générique
  const convergencePoints: ConvergencePoint[] = (viz.convergence_curve ?? [])
    .map((row) => ({
      n: Number(row.n ?? 0),
      fv: Number(row.fv ?? 0),
    }))
    .filter((p) => Number.isFinite(p.n) && Number.isFinite(p.fv) && p.n > 0);

  // Payoff histogram : la spec moteur retourne `{ bins, counts }` mais Zod
  // est en `z.unknown()` côté client (B1) car la shape n'est pas figée.
  const histogramRaw = viz.payoff_histogram as
    | { bins?: unknown; counts?: unknown }
    | null
    | undefined;
  const histogram = {
    bins: Array.isArray(histogramRaw?.bins)
      ? (histogramRaw.bins as unknown[]).map(Number).filter(Number.isFinite)
      : [],
    counts: Array.isArray(histogramRaw?.counts)
      ? (histogramRaw.counts as unknown[]).map(Number).filter(Number.isFinite)
      : [],
  };

  const hitRate = computeHitRate(viz.paths_metadata);
  const autoSubtitle =
    subtitle ??
    `${inputs.numPaths.toLocaleString('fr-FR')} paths · σ=${(inputs.sigma * 100).toFixed(1)} % · T=${inputs.T} ans · IFRS 2 grant date fair value`;

  return (
    <article className="space-y-5" data-testid="monte-carlo-viewer">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-overline text-brass-500">VALORISATION · MONTE CARLO</p>
          <h2 className="text-h2 text-ink-900">{title}</h2>
          <p className="text-ink-500 mt-1 text-sm">{autoSubtitle}</p>
        </div>
        {onRelaunch ? (
          <button
            type="button"
            onClick={onRelaunch}
            className="border-paper-300 bg-paper-50 text-ink-700 hover:bg-paper-200 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
            data-testid="monte-carlo-relaunch"
          >
            <RotateCw className="size-3.5" strokeWidth={1.5} />
            Relancer la simulation
          </button>
        ) : null}
      </header>

      {/* Parameters chips */}
      <ParametersCard {...inputs} />

      {/* Paths canvas */}
      <PathsCanvas
        paths={viz.paths_sample}
        metadata={viz.paths_metadata}
        S0={inputs.S0}
        barrier={inputs.barrier}
        numSteps={viz.num_steps}
        simT={viz.sim_T}
        enableReplay={enableReplay}
        currency={inputs.currency}
      />

      {/* KPI cards — 1/2/4 responsive */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MonteCarloKpi
          highlight
          label="Juste valeur"
          value={eurFormatter.format(run.fair_value_per_unit)}
          subtitle="par option · IFRS 2"
          testId="kpi-fv"
        />
        <MonteCarloKpi
          label="Erreur standard"
          value={
            run.std_error !== undefined ? `± ${eurPreciseFormatter.format(run.std_error)}` : '—'
          }
          subtitle="σ/√N"
          testId="kpi-stderr"
        />
        <MonteCarloKpi
          label="Hit rate barrière"
          value={hitRate !== null ? pctFormatter.format(hitRate) : '—'}
          subtitle="paths touchant la barrière"
          testId="kpi-hitrate"
        />
        <MonteCarloKpi
          label="Paths simulées"
          value={intFormatter.format(viz.total_paths)}
          subtitle={`${intFormatter.format(viz.sample_size)} affichées`}
          testId="kpi-paths"
        />
      </div>

      {/* Charts row : convergence + histogram */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ConvergenceChart curve={convergencePoints} finalFV={run.fair_value_per_unit} />
        <PayoffHistogram histogram={histogram} />
      </div>

      {/* Audit footer */}
      <AuditPanel
        inputHash={run.input_hash}
        seed={run.seed}
        engineVersion={run.engine_version}
        executionTimeMs={run.execution_time_ms}
        greeks={run.greeks}
      />
    </article>
  );
}
