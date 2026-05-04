import Link from 'next/link';
import type { Metadata } from 'next';
import { Calculator } from 'lucide-react';
import { PageShell } from '@/components/shared/PageShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/rbac';
import { listValuationRuns } from '@/server/actions/valuations';

export const metadata: Metadata = {
  title: 'Valorisations · Capiwise',
};

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Module 11 B5 — page liste cross-plans des valorisations Monte Carlo.
 *
 * Vue lecture seule (pas de "Lancer une simulation" ici — il faut passer
 * par un plan donné via /dashboard/plans/[id]/valuations).
 *
 * RLS : la liste est restreinte à l'org active de l'utilisateur via la SA
 * `listValuationRuns`. Pas de cross-org leak.
 */
export default async function ValuationsPage() {
  await requirePermission('valuations.read');

  const result = await listValuationRuns({ limit: 100 });
  const runs = result.ok ? result.runs : [];

  return (
    <PageShell
      title="Valorisations"
      description="Historique des simulations Monte Carlo (juste valeur IFRS 2) toutes plans confondus."
    >
      {!result.ok ? (
        <Card className="border-destructive/40 border-dashed">
          <CardContent className="py-6">
            <p className="text-destructive text-sm">Erreur lecture : {result.error}</p>
          </CardContent>
        </Card>
      ) : runs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Calculator className="text-muted-foreground size-10" />
            <p className="font-medium">Aucune simulation enregistrée</p>
            <p className="text-muted-foreground max-w-md text-sm">
              Lancez une simulation depuis la page d&apos;un plan : Plans → sélectionnez un plan →
              Valorisations → Lancer une simulation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const completed = run.completedAt ? new Date(run.completedAt) : null;
            const dateLabel = completed
              ? completed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
              : run.status;
            const fvLabel =
              run.fairValuePerUnit != null ? eurFormatter.format(run.fairValuePerUnit) : '—';
            const showViewer = run.status === 'DONE' && run.includesVisualization;
            const targetHref = showViewer
              ? `/dashboard/valuations/runs/${run.id}`
              : run.planId
                ? `/dashboard/plans/${run.planId}/valuations/${run.id}`
                : '#';
            return (
              <Link
                key={run.id}
                href={targetHref}
                className="border-paper-300 bg-paper-50 hover:bg-paper-100 flex items-center justify-between rounded-md border p-3 text-sm transition-colors"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <span className="text-ink-500 font-mono text-xs">{run.id.slice(0, 8)}</span>
                  <span className="text-ink-700">{run.planName ?? '—'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs">{fvLabel}</span>
                  {showViewer ? (
                    <Badge className="bg-brass-100 text-brass-900 border-brass-300 font-mono text-xs">
                      Monte Carlo
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground text-xs">{dateLabel}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'DONE') {
    return (
      <Badge className="border-emerald-300 bg-emerald-100 font-mono text-xs text-emerald-900">
        DONE
      </Badge>
    );
  }
  if (status === 'ERROR') {
    return (
      <Badge className="border-rose-300 bg-rose-100 font-mono text-xs text-rose-900">ERROR</Badge>
    );
  }
  if (status === 'RUNNING') {
    return (
      <Badge className="border-amber-300 bg-amber-100 font-mono text-xs text-amber-900">
        RUNNING
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-mono text-xs">
      {status}
    </Badge>
  );
}
