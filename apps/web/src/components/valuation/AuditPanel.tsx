'use client';

/**
 * Module 11 B3 — `AuditPanel.tsx`.
 *
 * Footer collapsible avec audit trail IFRS 2.46 (input_hash, seed,
 * engine_version, execution_time_ms) + Greeks dépliables.
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.7.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type AuditPanelProps = {
  inputHash: string;
  seed?: number;
  engineVersion: string;
  executionTimeMs: number;
  greeks?: Record<string, number>;
};

const intFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const greekFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const GREEK_LABELS: Record<string, string> = {
  delta: 'Delta',
  gamma: 'Gamma',
  vega: 'Vega',
  theta: 'Theta',
  rho: 'Rho',
};

export function AuditPanel({
  inputHash,
  seed,
  engineVersion,
  executionTimeMs,
  greeks,
}: AuditPanelProps) {
  const [open, setOpen] = useState(false);
  const hasGreeks = greeks && Object.keys(greeks).length > 0;

  // Truncate hash : "0x9c4f7a..." style
  const shortHash =
    inputHash.length > 16 ? `${inputHash.slice(0, 8)}…${inputHash.slice(-6)}` : inputHash;

  return (
    <div
      className="border-paper-300 bg-paper-50 rounded-md border px-4 py-3"
      data-testid="audit-panel"
    >
      <div className="text-ink-500 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
        <span>
          <span className="text-ink-400">Audit hash · </span>
          <span className="text-ink-700" title={inputHash}>
            {shortHash}
          </span>
        </span>
        {seed !== undefined ? (
          <span>
            <span className="text-ink-400">seed </span>
            <span className="text-ink-700">{seed}</span>
          </span>
        ) : null}
        <span>
          <span className="text-ink-400">engine </span>
          <span className="text-ink-700">{engineVersion}</span>
        </span>
        <span>
          <span className="text-ink-700">{intFormatter.format(executionTimeMs)}</span>
          <span className="text-ink-400"> ms</span>
        </span>
      </div>

      {hasGreeks ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-ink-500 hover:text-ink-900 mt-2 flex items-center gap-1 text-xs transition-colors"
          aria-expanded={open}
          data-testid="audit-greeks-toggle"
        >
          {open ? (
            <ChevronDown className="size-3" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="size-3" strokeWidth={1.5} />
          )}
          Greeks {open ? '(masquer)' : '(développer)'}
        </button>
      ) : null}

      {hasGreeks && open ? (
        <dl
          className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-3 md:grid-cols-5"
          data-testid="audit-greeks"
        >
          {Object.entries(greeks ?? {}).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-ink-500">{GREEK_LABELS[key] ?? key}</dt>
              <dd className="text-ink-900">{greekFormatter.format(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
