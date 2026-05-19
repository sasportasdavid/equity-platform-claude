/**
 * Web Worker wrapper du moteur Monte Carlo IFRS 2.
 *
 * Protocole de messages :
 *   in  : { type: 'run', requestId: string, input: McInput }
 *   out : { type: 'result', requestId: string, result: McResult }
 *       | { type: 'error',  requestId: string, message: string }
 *
 * Le Worker utilise `postMessage` avec `Transferable[]` pour les
 * `Float32Array` (`pathsSample`, `convergenceCurve` est un array d'objets
 * non-transférable, et `Uint8Array` pour `pathCategories`). Zéro-copie
 * vers le main thread.
 *
 * Annulation : single-threaded → les requêtes sont sérialisées par le
 * navigateur. Le Worker ne fait pas de yield mid-computation (pas de
 * chunking). Le hook côté main thread ignore les results dont le
 * `requestId` ≠ celui du dernier envoyé (stale rejection). Trade-off
 * documenté dans `memory/public_simulator_phase_2_complete.md`.
 *
 * Convention Next 16 / Turbopack :
 *   new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
 */

import { runMonteCarlo } from './engine';
import type { McInput, McResult } from './types';

export type WorkerInputMessage = {
  type: 'run';
  requestId: string;
  input: McInput;
};

export type WorkerOutputMessage =
  | { type: 'result'; requestId: string; result: McResult }
  | { type: 'error'; requestId: string; message: string };

// Le runtime worker est différent du DOM : on tape `self` minimum.
const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<WorkerInputMessage>) => void) | null;
  postMessage: (msg: WorkerOutputMessage, transfer?: Transferable[]) => void;
};

ctx.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'run') return;
  const { requestId, input } = msg;
  try {
    const result = await runMonteCarlo(input);
    // Transferable Float32Array + Uint8Array — zero-copy vers main.
    const transfer: Transferable[] = [result.pathsSample.buffer, result.pathCategories.buffer];
    ctx.postMessage({ type: 'result', requestId, result }, transfer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: 'error', requestId, message });
  }
};
