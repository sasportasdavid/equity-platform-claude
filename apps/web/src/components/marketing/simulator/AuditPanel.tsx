'use client';

import type { McResult } from '@/lib/mc/types';

const TODAY = new Date().toISOString().slice(0, 10);

/** Bandeau audit haut-droite : seed/hash/runtime/N. */
export function AuditPanel({ result }: { result: McResult | null }) {
  return (
    <div
      className="text-mkt-mono flex flex-col items-end gap-1 text-[11px] tracking-wider text-[#F0EAD8]/55"
      aria-live="polite"
    >
      <div>
        <span className="text-[#F0EAD8]/40">seed</span>{' '}
        <span className="text-[#F0EAD8]/85">
          {result ? formatSeed(result.inputHash) : '--------'}
        </span>
      </div>
      <div>
        <span className="text-[#F0EAD8]/40">hash</span>{' '}
        <span className="text-[#F0EAD8]/85">0x{result?.inputHash ?? '--------'}</span>
      </div>
      <div>
        <span className="text-[#F0EAD8]/40">runtime</span>{' '}
        <span className="text-[#F0EAD8]/85">
          {result
            ? `${Math.round(result.runtimeMs)} ms · ${formatPaths(result)}`
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

function formatSeed(hash: string): string {
  // On affiche le hash 8-hex comme "seed" éditorial (idem mockup).
  // Le vrai seed numérique est dans `params.seed` mais on n'a pas
  // d'accès direct ici ; le hash est dérivé du seed entre autres.
  return hash;
}

function formatPaths(result: McResult): string {
  // McResult ne contient pas N directement, mais on peut le retrouver
  // depuis pathCategories.length × sampleStride. On affiche un compteur
  // approximatif basé sur ça, ou bien on hard-code via convergenceCurve
  // qui se termine à count = N.
  const last = result.convergenceCurve[result.convergenceCurve.length - 1];
  const N = last?.n ?? result.pathCategories.length;
  if (N >= 1000) return `${(N / 1000).toFixed(0)}k paths`;
  return `${N} paths`;
}
