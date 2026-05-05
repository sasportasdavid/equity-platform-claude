'use client';

/**
 * Module 11 B0.6 — Poller client pour les runs valuation en QUEUED/RUNNING.
 *
 * Quand le pattern `EdgeRuntime.waitUntil()` est actif côté EF (B0.6, dette
 * #94), le run peut prendre 30s-3min selon num_paths. Le frontend SSR rend
 * un état d'attente, ce composant client le complète en pollant le status
 * toutes les 2s et déclenchant `router.refresh()` quand DONE/ERROR atteint
 * → la page se re-render automatiquement avec MonteCarloViewer.
 *
 * Cap dur 10 minutes (anti-runaway pour éviter de polling indéfiniment si
 * l'EF a planté sans marquer ERROR).
 *
 * Pas de Realtime Supabase ici : Module 11 B5 dette #98 a noté "Pages sans
 * Realtime" — le polling 2s est plus simple V1, suffisant pour des runs
 * <= ~3 min. V1.5 = passer en realtime postgres_changes si besoin.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const POLLING_INTERVAL_MS = 2000;
const MAX_POLLING_DURATION_MS = 10 * 60 * 1000; // 10 min cap dur

export type ValuationRunStatusPollerProps = {
  runId: string;
  /** Status initial (typiquement 'QUEUED' ou 'RUNNING'). Le composant ne poll que pour ces statuts. */
  initialStatus: 'QUEUED' | 'RUNNING';
};

export function ValuationRunStatusPoller({ runId, initialStatus }: ValuationRunStatusPollerProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<string>(initialStatus);

  useEffect(() => {
    // Si on arrive avec status terminal, ne pas poll
    if (currentStatus === 'DONE' || currentStatus === 'ERROR') return;

    const supabase = createSupabaseBrowserClient();
    const startedAt = Date.now();
    let cancelled = false;

    async function pollOnce() {
      const { data } = await supabase
        .from('valuation_runs')
        .select('status')
        .eq('id', runId)
        .maybeSingle();
      if (cancelled || !data) return;
      const next = (data.status as string) ?? 'QUEUED';
      if (next !== currentStatus) {
        setCurrentStatus(next);
      }
      if (next === 'DONE' || next === 'ERROR') {
        // Ne pas reload immédiatement : laisser React appliquer le setState
        // et le useEffect cleanup avant.
        setTimeout(() => {
          if (!cancelled) router.refresh();
        }, 200);
      }
    }

    const interval = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLLING_DURATION_MS) {
        clearInterval(interval);
        return;
      }
      void pollOnce();
    }, POLLING_INTERVAL_MS);

    // Premier poll immédiat (anti-race : l'EF a peut-être déjà fini avant
    // qu'on ait monté le composant si num_paths est petit).
    void pollOnce();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, currentStatus, router]);

  return (
    <div
      className="text-ink-500 mt-3 inline-flex items-center gap-2 text-xs"
      data-testid="valuation-run-status-poller"
    >
      <Loader2 className="size-3 animate-spin" strokeWidth={1.5} aria-hidden="true" />
      <span>Mise à jour automatique du statut…</span>
    </div>
  );
}
