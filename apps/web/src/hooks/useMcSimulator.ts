'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildInput, PRESETS } from '@/lib/mc/presets';
import type { McInput, McResult, PresetKey } from '@/lib/mc/types';
import type { WorkerInputMessage, WorkerOutputMessage } from '@/lib/mc/worker';

/**
 * Hook orchestrateur du simulateur Monte Carlo (Phase 2).
 *
 * Two-tier compute via Web Worker :
 *  - drag (slider en mouvement) : N=20k, steps=30 — ~250 ms
 *  - release / mount / preset change : N=60k, steps=40 — ~750 ms
 *
 * Cancellation : chaque requête a un `requestId`. On ignore les
 * results dont le requestId ≠ `latestRequestIdRef.current`. Le Worker
 * lui-même ne fait pas de chunking ; les requêtes sont sérialisées
 * mais on jette les résultats stales côté main thread.
 *
 * Debounce release : 200 ms après le dernier `setParam(.., false)` on
 * lance un run précis. Si l'user re-drag avant 200 ms, on annule le
 * timer et on reste en quick.
 */

const DEBOUNCE_RELEASE_MS = 200;
const QUICK = { N: 20_000, steps: 30 } as const;
const PRECISE = { N: 60_000, steps: 40 } as const;

export type SimulatorParams = {
  S0: number;
  K: number;
  B: number | null;
  sigma: number;
  r: number;
  q: number;
  T: number;
  seed: number;
};

export type SimulatorTier = 'quick' | 'precise';

export type UseMcSimulatorReturn = {
  result: McResult | null;
  isComputing: boolean;
  tier: SimulatorTier;
  presetKey: PresetKey;
  params: SimulatorParams;
  setPreset: (preset: PresetKey) => void;
  setParam: <K extends keyof SimulatorParams>(
    key: K,
    value: SimulatorParams[K],
    isDragging?: boolean,
  ) => void;
  nextSeed: () => void;
};

/** Test seam : permet à `useMcSimulator.test.ts` d'injecter un faux Worker. */
export type WorkerFactory = () => Worker;

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL('../lib/mc/worker.ts', import.meta.url), { type: 'module' });

export function useMcSimulator(
  initialPreset: PresetKey = 'psp_barrier',
  workerFactory: WorkerFactory = defaultWorkerFactory,
): UseMcSimulatorReturn {
  const [presetKey, setPresetKey] = useState<PresetKey>(initialPreset);
  const [params, setParams] = useState<SimulatorParams>(() => paramsFromPreset(initialPreset, 42));
  const [result, setResult] = useState<McResult | null>(null);
  const [isComputing, setIsComputing] = useState(true);
  const [tier, setTier] = useState<SimulatorTier>('precise');

  const workerRef = useRef<Worker | null>(null);
  const latestRequestIdRef = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestCounterRef = useRef(0);

  const send = useCallback(
    (overrides: Partial<SimulatorParams>, runTier: SimulatorTier) => {
      const worker = workerRef.current;
      if (!worker) return;
      const reqId = `r${++requestCounterRef.current}`;
      latestRequestIdRef.current = reqId;
      setIsComputing(true);
      setTier(runTier);
      const tierConfig = runTier === 'quick' ? QUICK : PRECISE;
      const input: McInput = {
        preset: presetKey,
        S0: overrides.S0 ?? params.S0,
        K: overrides.K ?? params.K,
        B: overrides.B === undefined ? params.B : overrides.B,
        sigma: overrides.sigma ?? params.sigma,
        r: overrides.r ?? params.r,
        q: overrides.q ?? params.q,
        T: overrides.T ?? params.T,
        seed: overrides.seed ?? params.seed,
        N: tierConfig.N,
        steps: tierConfig.steps,
      };
      const msg: WorkerInputMessage = { type: 'run', requestId: reqId, input };
      worker.postMessage(msg);
    },
    [params, presetKey],
  );

  // Bootstrap worker + premier run au mount
  useEffect(() => {
    const worker = workerFactory();
    workerRef.current = worker;
    worker.onmessage = (ev: MessageEvent<WorkerOutputMessage>) => {
      const msg = ev.data;
      if (msg.requestId !== latestRequestIdRef.current) return; // stale, ignore
      if (msg.type === 'result') {
        setResult(msg.result);
        setIsComputing(false);
      } else if (msg.type === 'error') {
        console.error('[mc-simulator] worker error:', msg.message);
        setIsComputing(false);
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [workerFactory]);

  // Premier run après bootstrap worker
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (workerRef.current && !bootstrappedRef.current) {
      bootstrappedRef.current = true;
      send({}, 'precise');
    }
  }, [send]);

  const setPreset = useCallback(
    (preset: PresetKey) => {
      if (preset === presetKey) return;
      // Annule debounce pending
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const newParams = paramsFromPreset(preset, params.seed);
      setPresetKey(preset);
      setParams(newParams);
      // Run précis direct (changement de preset = pas un drag)
      // Note : on doit envoyer avec le NOUVEAU presetKey, mais send() ferme
      // sur l'ancien via closure. On envoie manuellement ici.
      const worker = workerRef.current;
      if (!worker) return;
      const reqId = `r${++requestCounterRef.current}`;
      latestRequestIdRef.current = reqId;
      setIsComputing(true);
      setTier('precise');
      const input: McInput = {
        ...newParams,
        preset,
        N: PRECISE.N,
        steps: PRECISE.steps,
      };
      worker.postMessage({ type: 'run', requestId: reqId, input } satisfies WorkerInputMessage);
    },
    [presetKey, params.seed],
  );

  const setParam = useCallback(
    <K extends keyof SimulatorParams>(key: K, value: SimulatorParams[K], isDragging = false) => {
      setParams((prev) => ({ ...prev, [key]: value }));
      // Annule debounce pending
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (isDragging) {
        // Quick run + arm debounce vers precise
        send({ [key]: value } as Partial<SimulatorParams>, 'quick');
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          send({ [key]: value } as Partial<SimulatorParams>, 'precise');
        }, DEBOUNCE_RELEASE_MS);
      } else {
        // Release direct → precise
        send({ [key]: value } as Partial<SimulatorParams>, 'precise');
      }
    },
    [send],
  );

  const nextSeed = useCallback(() => {
    const newSeed = (params.seed + 1) >>> 0;
    setParams((prev) => ({ ...prev, seed: newSeed }));
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    send({ seed: newSeed }, 'precise');
  }, [params.seed, send]);

  return useMemo(
    () => ({ result, isComputing, tier, presetKey, params, setPreset, setParam, nextSeed }),
    [result, isComputing, tier, presetKey, params, setPreset, setParam, nextSeed],
  );
}

function paramsFromPreset(preset: PresetKey, seed: number): SimulatorParams {
  const input = buildInput(preset, { seed });
  void PRESETS; // Keep PRESETS imported for eslint awareness in tree-shaken deps
  return {
    S0: input.S0,
    K: input.K,
    B: input.B,
    sigma: input.sigma,
    r: input.r,
    q: input.q,
    T: input.T,
    seed: input.seed,
  };
}
