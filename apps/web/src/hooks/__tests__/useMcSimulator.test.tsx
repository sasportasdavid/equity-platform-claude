// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMcSimulator } from '@/hooks/useMcSimulator';
import type { McResult } from '@/lib/mc/types';
import type { WorkerInputMessage, WorkerOutputMessage } from '@/lib/mc/worker';

/**
 * Worker mock minimal — capture les messages reçus, expose `simulateResult`
 * pour faire répondre la fixture en différé.
 */
class MockWorker {
  messages: WorkerInputMessage[] = [];
  onmessage: ((ev: MessageEvent<WorkerOutputMessage>) => void) | null = null;
  terminated = false;

  postMessage(msg: WorkerInputMessage) {
    this.messages.push(msg);
  }
  terminate() {
    this.terminated = true;
  }

  /** Simule la réception d'un result du worker avec un delay 0. */
  respondToLast(result: McResult) {
    const last = this.messages[this.messages.length - 1];
    if (!last) return;
    this.respond(last.requestId, result);
  }
  respond(requestId: string, result: McResult) {
    const ev = {
      data: { type: 'result', requestId, result },
    } as unknown as MessageEvent<WorkerOutputMessage>;
    this.onmessage?.(ev);
  }
}

function makeFakeResult(): McResult {
  return {
    fairValue: 13.27,
    stdError: 0.057,
    ic95: [13.16, 13.38],
    hitRateBarrier: 0.418,
    forfeitedRate: 0.582,
    itmFinalRate: 0.348,
    delta: 0.7,
    vega: 38.8,
    rho: 72.5,
    pathsSample: new Float32Array([50, 51, 52]),
    pathCategories: new Uint8Array([2]),
    convergenceCurve: [{ n: 60_000, fv: 13.27, ic: 0.111 }],
    payoffHistogram: { bins: [], counts: [], pathsAtZero: 0 },
    terminalHistogram: { bins: [], counts: [], median: 0 },
    hitTimeHistogram: { bins: [], counts: [], mean: 0 },
    inputHash: 'deadbeef',
    runtimeMs: 740,
    engineVersion: 'capiwise-mc-js-1.0.0',
    N: 60_000,
    steps: 40,
  };
}

describe('useMcSimulator', () => {
  let worker: MockWorker;
  const factory = () => worker as unknown as Worker;

  beforeEach(() => {
    worker = new MockWorker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mount_kicks_precise_run — un run N=60000 démarré au mount', () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    // useEffect bootstrap fire APRÈS le render → flush
    act(() => {});
    expect(worker.messages).toHaveLength(1);
    expect(worker.messages[0]!.input.N).toBe(60_000);
    expect(worker.messages[0]!.input.steps).toBe(40);
    expect(worker.messages[0]!.input.preset).toBe('psp_barrier');
    expect(result.current.isComputing).toBe(true);
    expect(result.current.tier).toBe('precise');
  });

  it('result_applied_after_response', () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    act(() => {});
    const fixture = makeFakeResult();
    act(() => {
      worker.respondToLast(fixture);
    });
    expect(result.current.result).toBe(fixture);
    expect(result.current.isComputing).toBe(false);
  });

  it('setPreset_aborts_pending — pending run abandonné quand preset change', () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    act(() => {});
    expect(worker.messages).toHaveLength(1);
    const firstReqId = worker.messages[0]!.requestId;
    // Avant la réponse, on change de preset
    act(() => {
      result.current.setPreset('aga_classic');
    });
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]!.input.preset).toBe('aga_classic');
    // Si le worker répond au 1er requestId (stale), le hook doit l'ignorer
    const stale = makeFakeResult();
    act(() => {
      worker.respond(firstReqId, stale);
    });
    expect(result.current.result).toBeNull();
  });

  it('dragging_uses_quick_tier — setParam(.., true) lance run N=20000', () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    act(() => {});
    expect(worker.messages).toHaveLength(1);
    act(() => {
      result.current.setParam('sigma', 0.4, true);
    });
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]!.input.N).toBe(20_000);
    expect(worker.messages[1]!.input.steps).toBe(30);
    expect(worker.messages[1]!.input.sigma).toBe(0.4);
    expect(result.current.tier).toBe('quick');
  });

  it('release_debounce_kicks_precise — 200ms après setParam(.., false)', () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    act(() => {});
    expect(worker.messages).toHaveLength(1);
    // Drag → quick + arme debounce
    act(() => {
      result.current.setParam('sigma', 0.4, true);
    });
    expect(worker.messages).toHaveLength(2);
    // Avancer 200ms : debounce kick precise
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(worker.messages).toHaveLength(3);
    expect(worker.messages[2]!.input.N).toBe(60_000);
    expect(worker.messages[2]!.input.sigma).toBe(0.4);
    expect(result.current.tier).toBe('precise');
  });

  it('release_direct_no_debounce — setParam(.., false) lance precise direct', () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    act(() => {});
    expect(worker.messages).toHaveLength(1);
    act(() => {
      result.current.setParam('sigma', 0.4, false);
    });
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]!.input.N).toBe(60_000);
    expect(result.current.tier).toBe('precise');
  });

  it("stale_result_ignored — un result tardif avec requestId obsolète n'écrase pas le state", () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    act(() => {});
    const firstReqId = worker.messages[0]!.requestId;
    // Lance un drag qui pousse un nouveau message (donc latestRequestId change)
    act(() => {
      result.current.setParam('sigma', 0.4, true);
    });
    const fresh = makeFakeResult();
    fresh.fairValue = 99;
    // Le worker répond au PREMIER (stale)
    act(() => {
      worker.respond(firstReqId, fresh);
    });
    expect(result.current.result).toBeNull();
    // Maintenant il répond au DEUXIÈME (current)
    const current = makeFakeResult();
    current.fairValue = 42;
    act(() => {
      worker.respondToLast(current);
    });
    expect(result.current.result?.fairValue).toBe(42);
  });

  it('nextSeed_kicks_precise — incremente seed et lance precise', () => {
    const { result } = renderHook(() => useMcSimulator('psp_barrier', factory));
    act(() => {});
    const initialSeed = result.current.params.seed;
    act(() => {
      result.current.nextSeed();
    });
    expect(result.current.params.seed).toBe((initialSeed + 1) >>> 0);
    const last = worker.messages[worker.messages.length - 1]!;
    expect(last.input.N).toBe(60_000);
    expect(last.input.seed).toBe(initialSeed + 1);
  });
});
