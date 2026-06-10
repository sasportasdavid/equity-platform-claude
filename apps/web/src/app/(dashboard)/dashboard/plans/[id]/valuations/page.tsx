import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, FileText, PlayCircle } from 'lucide-react';
import { uuidSchema } from '@equity/shared';
import { PageShell } from '@/components/shared/PageShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/rbac';
import { listValuationRuns } from '@/server/actions/valuations';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RequestValuationRunDialog } from '@/components/valuation/RequestValuationRunDialog';

export const metadata: Metadata = {
  title: 'Valorisations · Plan · Capiwise',
};

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Module 11 B5 — page liste des valorisations Monte Carlo d'un plan.
 *
 * Affiche :
 *   - bouton "Lancer une simulation" (modal RequestValuationRunDialog)
 *   - liste paginée des runs (status, FV, viz indicator, link replay)
 *
 * RLS : la liste est restreinte à l'org active de l'utilisateur via
 * RLS valuation_runs SELECT (perm `plans.read`). Pas de cross-org leak.
 */
export default async function PlanValuationsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('valuations.read');
  const { id: rawId } = await params;
  const planIdCheck = uuidSchema.safeParse(rawId);
  if (!planIdCheck.success) redirect('/dashboard/plans');

  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from('plans')
    .select('id, name, plan_type, deleted_at')
    .eq('id', planIdCheck.data)
    .maybeSingle();
  if (!plan || plan.deleted_at) notFound();

  const result = await listValuationRuns({ planId: planIdCheck.data, limit: 50 });
  const runs = result.ok ? result.runs : [];

  return (
    <PageShell
      title={
        <span className="flex items-center gap-3">
          {plan.name} · valorisations
          <Badge variant="outline" className="font-mono text-xs">
            {plan.plan_type}
          </Badge>
        </span>
      }
      description="Historique des simulations Monte Carlo IFRS 2 pour ce plan."
      actions={
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/plans/${planIdCheck.data}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
          >
            <ArrowLeft className="mr-2 size-4" />
            Retour au plan
          </Link>
          <RequestValuationRunDialog planId={planIdCheck.data} />
        </div>
      }
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
            <PlayCircle className="text-muted-foreground size-10" />
            <p className="font-medium">Aucune simulation pour ce plan</p>
            <p className="text-muted-foreground max-w-md text-sm">
              Lancez une première simulation pour calculer la juste valeur Monte Carlo (IFRS 2) et
              générer la visualisation des trajectoires.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const completed = run.completedAt ? new Date(run.completedAt) : null;
            const date = completed
              ? completed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
              : run.status;
            const fvLabel =
              run.fairValuePerUnit != null ? eurFormatter.format(run.fairValuePerUnit) : '—';
            const showViewer = run.status === 'DONE' && run.includesVisualization;
            const targetHref = showViewer
              ? `/dashboard/valuations/runs/${run.id}`
              : `/dashboard/plans/${planIdCheck.data}/valuations/${run.id}`;
            return (
              <Link
                key={run.id}
                href={targetHref}
                className="border-paper-300 bg-paper-50 hover:bg-paper-100 flex items-center justify-between rounded-md border p-4 transition-colors"
                data-testid={`valuation-run-${run.id}`}
              >
                <div className="flex items-center gap-4">
                  <StatusBadge status={run.status} />
                  <div>
                    <div className="text-ink-500 font-mono text-xs">{run.id.slice(0, 8)}</div>
                    <div className="text-sm">{date}</div>
                  </div>
                  <div className="border-paper-300 border-l pl-4">
                    <div className="text-overline text-ink-500">Juste valeur</div>
                    <div className="font-mono text-sm">{fvLabel}</div>
                  </div>
                  {run.engineVersion ? (
                    <Badge variant="outline" className="font-mono text-xs">
                      {run.engineVersion}
                    </Badge>
                  ) : null}
                  {run.runType !== 'MANUAL' ? (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {run.runType}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {showViewer ? (
                    <Badge className="bg-brass-100 text-brass-900 border-brass-300 font-mono text-xs">
                      Monte Carlo
                    </Badge>
                  ) : (
                    <FileText className="text-muted-foreground size-4" aria-hidden="true" />
                  )}
                  {run.triggeredByEmail ? (
                    <span className="text-muted-foreground text-xs">{run.triggeredByEmail}</span>
                  ) : null}
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
      <Badge className="border-emerald-300 bg-emerald-100 font-mono text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        DONE
      </Badge>
    );
  }
  if (status === 'ERROR') {
    return (
      <Badge className="border-rose-300 bg-rose-100 font-mono text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
        ERROR
      </Badge>
    );
  }
  if (status === 'RUNNING') {
    return (
      <Badge className="border-amber-300 bg-amber-100 font-mono text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
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
