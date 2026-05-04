'use client';

/**
 * Module 10 B3 — `valuation-toggle.tsx` (création initiale).
 *
 * Spec MODULE_10 §1.4 : segmented control 3 modes (Consolidé / Dilué /
 * Pro forma) qui driver le `viewMode` du compute_cap_table RPC.
 *
 * ⚠️ Erratum spec §0.2 : la spec disait "déjà créé en PR #12" — c'était
 * faux (cf memory/module_10_recon.md §3). Création initiale en B3.
 *
 * Pattern : URL search param `view` (synced avec RHF/Server Component)
 * pour permettre les liens partagés et le browser back. Pas de localStorage
 * (CLAUDE.md interdit).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { type ViewMode, VIEW_MODES } from '@equity/shared';
import { cn } from '@/lib/utils';

const LABELS: Record<ViewMode, string> = {
  CONSOLIDATED: 'Consolidé',
  DILUTED: 'Dilué',
  PRO_FORMA: 'Pro forma',
};

const HINTS: Record<ViewMode, string> = {
  CONSOLIDATED: 'Positions actives uniquement (réelles)',
  DILUTED: '+ awards GRANTED non exercés (ESOP virtuel)',
  PRO_FORMA: 'Dilué + scénario hypothétique appliqué',
};

export function ValuationToggle({ current, className }: { current: ViewMode; className?: string }) {
  const router = useRouter();
  const params = useSearchParams();

  function setView(next: ViewMode) {
    const newParams = new URLSearchParams(params.toString());
    if (next === 'CONSOLIDATED') {
      newParams.delete('view'); // default — keep URL clean
    } else {
      newParams.set('view', next);
    }
    const qs = newParams.toString();
    router.push(qs ? `?${qs}` : '?');
  }

  return (
    <div
      className={cn('inline-flex items-center gap-0 rounded-md border p-0.5 text-sm', className)}
      role="tablist"
      aria-label="Mode de vue cap table"
      data-testid="valuation-toggle"
    >
      {VIEW_MODES.map((mode) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => setView(mode)}
            title={HINTS[mode]}
            className={cn(
              'rounded px-3 py-1.5 transition-colors',
              active
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
