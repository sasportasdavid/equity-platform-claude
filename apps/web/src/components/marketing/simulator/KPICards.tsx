'use client';

import type { McResult } from '@/lib/mc/types';
import { cn } from '@/lib/utils';

const NF_EUR = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NF_PCT = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const NF_INT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function formatPaths(N: number): string {
  if (N >= 1000) return `${Math.round(N / 1000)}k`;
  return String(N);
}

export function KPICards({ result, isQuick }: { result: McResult | null; isQuick: boolean }) {
  const fv = result?.fairValue;
  const ic = result?.ic95;
  const stdErr = result?.stdError;
  const last = result?.convergenceCurve[result.convergenceCurve.length - 1];
  const N = last?.n ?? 0;

  return (
    <div className={cn('flex flex-col gap-4', isQuick && 'opacity-90')}>
      {/* Card principale */}
      <div className="border-white/8 bg-white/3 rounded-[8px] border p-5">
        <div className="text-mkt-mono mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
          Juste valeur · IFRS 2 grant FV
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-[56px] font-medium leading-none tracking-[-0.03em] text-[#F0EAD8]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {fv !== undefined ? NF_EUR.format(fv) : '—'}
          </span>
          <span className="text-mkt-mono text-[18px] text-[#D4A06A]">€</span>
          {isQuick ? (
            <span
              className="ml-2 inline-block size-1.5 animate-pulse rounded-full bg-[#D4A06A]/70"
              aria-label="estimation rapide en cours"
            />
          ) : null}
        </div>
        <div className="text-mkt-mono mt-3 flex items-baseline gap-3 text-[11px] text-[#F0EAD8]/55">
          {stdErr !== undefined && ic ? (
            <>
              <span>± {NF_EUR.format(stdErr * 1.96)} €</span>
              <span className="text-[#F0EAD8]/35">IC 95%</span>
              <span>
                [{NF_EUR.format(ic[0])} ; {NF_EUR.format(ic[1])}]
              </span>
            </>
          ) : (
            <span className="text-[#F0EAD8]/30">— en attente de simulation</span>
          )}
        </div>
      </div>

      {/* 4 KPIs grid 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <MiniKpi
          label="Hit rate"
          value={result ? `${NF_PCT.format(result.hitRateBarrier * 100)}` : '—'}
          unit="%"
          sub={result?.hitRateBarrier ? 'paths ≥ B' : 'pas de barrière'}
        />
        <MiniKpi
          label="Forfeited"
          value={result ? `${NF_PCT.format(result.forfeitedRate * 100)}` : '—'}
          unit="%"
          sub="payoff = 0"
        />
        <MiniKpi
          label="ITM final"
          value={result ? `${NF_PCT.format(result.itmFinalRate * 100)}` : '—'}
          unit="%"
          sub="contribuent à FV"
        />
        <MiniKpi
          label="Paths"
          value={N ? formatPaths(N) : '—'}
          unit={N >= 1000 ? '' : ''}
          sub={result ? `${NF_INT.format(N)} simulés` : '—'}
        />
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
}) {
  return (
    <div className="border-white/8 bg-white/3 rounded-[8px] border p-3.5">
      <div className="text-mkt-mono mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
        {label}
      </div>
      <div className="flex items-baseline gap-0.5">
        <span
          className="text-[26px] font-medium leading-none tracking-[-0.02em] text-[#F0EAD8]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {value}
        </span>
        {unit ? <span className="text-mkt-mono text-[14px] text-[#D4A06A]">{unit}</span> : null}
      </div>
      <div className="text-mkt-mono mt-2 text-[10px] text-[#F0EAD8]/45">{sub}</div>
    </div>
  );
}
