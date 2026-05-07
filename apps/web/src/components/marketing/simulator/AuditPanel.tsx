'use client';

import type { McResult } from '@/lib/mc/types';

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Bandeau audit haut-droite.
 *
 * Phase 2.1 fix #3 : seed et hash sont DEUX choses distinctes.
 *  - seed : entier 32-bit (source de randomness reproductible),
 *           affiché en hex padé sur 8 chars
 *  - hash : SHA-256 truncated des inputs canonicalisés (change quand
 *           tweak Vol/B/T) — déjà calculé côté engine via
 *           crypto.subtle.digest, exposé dans `result.inputHash`
 */
export function AuditPanel({ result, seed }: { result: McResult | null; seed: number }) {
  const seedHex = (seed >>> 0).toString(16).padStart(8, '0');
  return (
    <div
      className="text-mkt-mono flex flex-col items-end gap-1 text-[11px] tracking-wider text-[#F0EAD8]/55"
      aria-live="polite"
    >
      <div>
        <span className="text-[#F0EAD8]/40">seed</span>{' '}
        <span className="text-[#F0EAD8]/85">{seedHex}</span>
      </div>
      <div>
        <span className="text-[#F0EAD8]/40">hash</span>{' '}
        <span className="text-[#F0EAD8]/85">0x{result?.inputHash ?? '--------'}</span>
      </div>
      <div>
        <span className="text-[#F0EAD8]/40">runtime</span>{' '}
        <span className="text-[#F0EAD8]/85">
          {result
            ? `${Math.round(result.runtimeMs)} ms · ${formatPaths(result.N)}`
            : '— ms · — paths'}
        </span>
      </div>
    </div>
  );
}

/** Footer audit bas du simulateur : moteur · pricer · conformité IFRS 2. */
export function AuditFooter({ result }: { result: McResult | null }) {
  const version = result?.engineVersion ?? 'capiwise-mc-js-1.0.0';
  return (
    <div className="text-mkt-mono border-white/8 mt-6 flex flex-col items-stretch gap-1 border-t pt-4 text-[10.5px] tracking-wider text-[#F0EAD8]/40 sm:flex-row sm:justify-between">
      <span>
        moteur · GBM Box-Muller · pricer barrier-up-and-in call · discount continuous · v{version}
      </span>
      <span>conforme IFRS 2 §16-18 · audit-ready · {TODAY}</span>
    </div>
  );
}

function formatPaths(N: number): string {
  if (N >= 1000) return `${Math.round(N / 1000)}k paths`;
  return `${N} paths`;
}
