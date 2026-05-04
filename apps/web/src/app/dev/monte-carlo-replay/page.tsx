'use client';

/**
 * Module 11 B3 — Sandbox `/dev/monte-carlo-replay/page.tsx`.
 *
 * Permet de tester les composants viewer Monte Carlo avec 4 presets
 * synthétiques (PSP barrière, BSPCE simple, AGA TSR, peer group).
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.11.
 *
 * V1 (B3) : génération de fixtures déterministes côté client (mulberry32
 * GBM). Pas d'appel direct au moteur Python depuis le browser :
 *   - `callMultiTrancheCompute` est `'server-only'` (porte le secret API key)
 *   - CORS Fly.io pas configuré pour les origins navigateur
 *   - Auth Bearer non disponible côté client
 *
 * V1.5/B5+ : remplacer la génération fixture par un Server Action wrapper
 * qui appelle vraiment le moteur Python avec des payloads V2 réels.
 *
 * Layout : 4 boutons preset → MonteCarloViewer en bas avec replay activé.
 */

import { useMemo, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { MonteCarloViewer } from '@/components/valuation/MonteCarloViewer';
import { generateFixture, PRESETS, type Preset } from '@/components/valuation/fixtures';

type RunResult = ReturnType<typeof generateFixture>;

export default function MonteCarloReplaySandboxPage() {
  const [pending, startTransition] = useTransition();
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [replayKey, setReplayKey] = useState(0);

  function handlePresetClick(preset: Preset) {
    setActivePreset(preset);
    startTransition(() => {
      // Compute fixture in microtask to keep UI responsive
      // (mulberry32 + GBM ~600 paths × 36 steps = ~5ms typique).
      Promise.resolve().then(() => {
        const result = generateFixture(preset);
        setRun(result);
        setReplayKey((k) => k + 1);
      });
    });
  }

  function handleRelaunch() {
    if (!activePreset) return;
    // Re-render le viewer en changeant la key → re-déclenche l'animation
    setReplayKey((k) => k + 1);
  }

  const viewer = useMemo(() => {
    if (!run || !activePreset) return null;
    return (
      <MonteCarloViewer
        key={replayKey}
        run={{
          fair_value_per_unit: run.fairValuePerUnit,
          std_error: run.stdError,
          visualization: run.visualization,
          greeks: run.greeks,
          input_hash: run.inputHash,
          engine_version: run.engineVersion,
          execution_time_ms: run.executionTimeMs,
          seed: run.seed,
        }}
        inputs={activePreset.inputs}
        onRelaunch={handleRelaunch}
        enableReplay
        title={`Sandbox · ${activePreset.name}`}
        subtitle={activePreset.description}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, replayKey]);

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <header>
        <p className="text-overline text-brass-500">DEV SANDBOX · MONTE CARLO</p>
        <h1 className="text-h1 text-ink-900">
          Replay <span className="serif-italic text-brass-500">cinématique</span>
        </h1>
        <p className="text-ink-500 mt-2 max-w-2xl text-sm">
          Sélectionne un preset pour générer un calcul fixture (GBM seed-based) et tester les
          composants viewer. Le bouton <strong>Relancer la simulation</strong> rejoue
          l&apos;animation côté client sans recalculer.
        </p>
        <p className="text-ink-400 mt-1 text-xs">
          ⚠️ V1 = fixtures déterministes côté navigateur. Branchement réel sur le moteur Python en
          B5+ via Server Action wrapper (auth Bearer + CORS).
        </p>
      </header>

      {/* Preset selector */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => handlePresetClick(preset)}
            disabled={pending}
            className={`text-ink-900 rounded-md border p-3 text-left transition-colors ${
              activePreset?.id === preset.id
                ? 'border-brass-500 bg-brass-50'
                : 'border-paper-300 bg-paper-50 hover:bg-paper-200'
            }`}
            data-testid={`preset-${preset.id}`}
          >
            <div className="text-ink-500 font-mono text-xs uppercase tracking-wider">
              {preset.id}
            </div>
            <div className="mt-1 font-medium">{preset.name}</div>
            <div className="text-ink-500 mt-0.5 text-xs">{preset.description}</div>
          </button>
        ))}
      </section>

      {/* Viewer / loading / empty */}
      <section>
        {pending && !run ? (
          <div className="border-paper-300 bg-paper-50 text-ink-500 flex items-center justify-center gap-2 rounded-md border border-dashed p-12">
            <Loader2 className="size-4 animate-spin" />
            Génération du fixture…
          </div>
        ) : null}

        {!pending && !run ? (
          <div className="border-paper-300 bg-paper-50 text-ink-500 flex items-center justify-center rounded-md border border-dashed p-12 text-sm">
            Sélectionne un preset ci-dessus pour commencer.
          </div>
        ) : null}

        {viewer}
      </section>
    </div>
  );
}
