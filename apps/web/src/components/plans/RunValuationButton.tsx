'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, PlayCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { runValuation } from '@/server/actions/valuations';

/**
 * Bouton « Lancer une valorisation » + status realtime.
 *
 * Workflow :
 *  1. Click → runValuation Server Action → INSERT QUEUED + invoke Edge
 *  2. Subscribe Realtime sur valuation_runs WHERE id=runId
 *  3. UI affiche QUEUED → RUNNING → DONE/ERROR au fur et à mesure
 *  4. Sur DONE → router.refresh() pour réafficher le plan avec la valorisation
 *
 * Realtime activée en B5.0 via `ALTER PUBLICATION supabase_realtime ADD TABLE
 * valuation_runs` — pas de subscribe à activer côté Dashboard.
 */
export function RunValuationButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'QUEUED' | 'RUNNING' | 'DONE' | 'ERROR'>('IDLE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Subscribe Realtime quand on a un runId. La subscribe est non-instantanée
  // (handshake WebSocket + ack Supabase ~200-500ms) ; entre-temps l'Edge
  // Function peut déjà avoir fait UPDATE → DONE (~6-7s typique mais parfois
  // <1s en cache chaud). On déclenche donc aussi un SELECT one-shot pour
  // capter l'état courant et éviter de rester bloqué sur QUEUED si l'event
  // a été émis avant l'établissement de la souscription.
  useEffect(() => {
    if (!runId) return;
    const supabase = createSupabaseBrowserClient();

    function applyStatus(newRow: { status?: string | null; error_message?: string | null }) {
      if (newRow.status === 'RUNNING' || newRow.status === 'DONE' || newRow.status === 'ERROR') {
        setStatus(newRow.status);
        if (newRow.status === 'ERROR') {
          setErrorMsg(newRow.error_message ?? 'Erreur inconnue');
        }
        if (newRow.status === 'DONE') {
          setTimeout(() => router.refresh(), 500);
        }
      }
    }

    let cancelled = false;

    // SELECT one-shot anti-race
    void supabase
      .from('valuation_runs')
      .select('status, error_message')
      .eq('id', runId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) applyStatus(data);
      });

    // Souscription Realtime pour les transitions futures
    const channel = supabase
      .channel(`valuation_run_${runId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'valuation_runs',
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          applyStatus(payload.new as { status?: string; error_message?: string | null });
        },
      )
      .subscribe();

    // Filet de sécurité : si toujours QUEUED après 30 s, on refait un SELECT
    // (Realtime peut être down/RLS-bloqué ; on évite de laisser le badge
    // tourner indéfiniment). 30 s couvre le pire cas observé (~7 s typique).
    const fallback = setTimeout(() => {
      if (cancelled) return;
      void supabase
        .from('valuation_runs')
        .select('status, error_message')
        .eq('id', runId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) applyStatus(data);
        });
    }, 30_000);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      void supabase.removeChannel(channel);
    };
  }, [runId, router]);

  function handleClick() {
    setErrorMsg(null);
    setStatus('QUEUED');
    startTransition(async () => {
      const result = await runValuation(planId);
      if (result.ok) {
        setRunId(result.runId);
      } else {
        setStatus('ERROR');
        setErrorMsg(result.error);
      }
    });
  }

  // Pas encore lancé OU erreur précédente → bouton actif
  if (status === 'IDLE' || status === 'ERROR') {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          data-testid="run-valuation-button"
        >
          <PlayCircle className="mr-2 size-4" />
          {isPending ? 'Démarrage…' : 'Lancer une valorisation'}
        </Button>
        {status === 'ERROR' && errorMsg ? (
          <span className="text-destructive flex items-center gap-1 text-xs">
            <XCircle className="size-3.5" />
            {errorMsg}
          </span>
        ) : null}
      </div>
    );
  }

  // QUEUED ou RUNNING → status badge + spinner
  if (status === 'QUEUED' || status === 'RUNNING') {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 px-3 py-1.5"
        data-testid={`valuation-status-${status.toLowerCase()}`}
      >
        <Loader2 className="size-3.5 animate-spin" />
        {status === 'QUEUED' ? 'En file…' : 'Calcul en cours…'}
      </Badge>
    );
  }

  // DONE → check vert puis le router.refresh va recharger la page
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
      data-testid="valuation-status-done"
    >
      <CheckCircle2 className="size-3.5" />
      Valorisation terminée
    </Badge>
  );
}
