import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { uuidSchema, visualizationPayloadSchema } from '@equity/shared';
import type { VisualizationPayload } from '@equity/shared';
import { PageShell } from '@/components/shared/PageShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/rbac';
import { getValuationRunById } from '@/server/actions/valuations';
import { MonteCarloViewer } from '@/components/valuation/MonteCarloViewer';

export const metadata: Metadata = {
  title: 'Valorisation Monte Carlo · Capiwise',
};

/**
 * Module 11 B5 — page replay viewer Monte Carlo.
 *
 * URL canonique pour visualiser un valuation_run avec viz incluse. Si le
 * run n'a pas de visualisation (includes_visualization=false), on redirige
 * vers la page legacy `/dashboard/plans/[planId]/valuations/[runId]` qui
 * affiche les KPI + sensitivities sans le viewer cinématique.
 *
 * Si le run est encore RUNNING/QUEUED → message d'attente avec auto-refresh
 * V1.5 (V1 = manuel via reload).
 */
export default async function ValuationRunReplayPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requirePermission('valuations.read');

  const { runId: rawRunId } = await params;
  const runIdCheck = uuidSchema.safeParse(rawRunId);
  if (!runIdCheck.success) redirect('/dashboard/valuations');

  const result = await getValuationRunById(runIdCheck.data);
  if (!result.ok) {
    return (
      <PageShell title="Valorisation introuvable" description={result.error}>
        <BackLink href="/dashboard/valuations" label="Retour aux valorisations" />
      </PageShell>
    );
  }
  const run = result.run;

  // Pas de viz → fallback page legacy (preserve les KPI + sensitivities pour
  // les runs SANS visualization, ex: AGA pure ou plan BSPCE simple).
  if (!run.includesVisualization && run.planId) {
    redirect(`/dashboard/plans/${run.planId}/valuations/${run.id}`);
  }

  const completed = run.completedAt ? new Date(run.completedAt) : null;
  const completedLabel = completed
    ? completed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : run.status;

  // Status non-DONE → message d'attente
  if (run.status !== 'DONE') {
    return (
      <PageShell
        title={
          <span className="flex items-center gap-3">
            {run.planName ?? 'Valorisation'} · {run.id.slice(0, 8)}
            <Badge variant="outline" className="font-mono text-xs">
              {run.status}
            </Badge>
          </span>
        }
        description="Calcul en cours côté moteur Python."
        actions={
          run.planId ? (
            <BackLink
              href={`/dashboard/plans/${run.planId}/valuations`}
              label="Retour aux valorisations du plan"
            />
          ) : null
        }
      >
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="text-muted-foreground size-10" />
            <p className="font-medium">{statusLabel(run.status)}</p>
            {run.errorMessage ? (
              <p className="text-destructive max-w-xl font-mono text-xs">{run.errorMessage}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Rechargez la page pour voir l&apos;état le plus récent.
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // Status DONE — extract visualization du response_received
  const response = run.responseReceived as {
    visualization?: unknown;
    fair_value_per_unit?: number;
    std_error?: number;
    greeks?: Record<string, number>;
    execution_time_ms?: number;
  } | null;
  const vizParse = visualizationPayloadSchema.safeParse(response?.visualization);
  if (!vizParse.success) {
    return (
      <PageShell
        title="Visualisation manquante"
        description="Le run est DONE mais la visualisation n'a pas pu être lue."
        actions={
          run.planId ? (
            <BackLink
              href={`/dashboard/plans/${run.planId}/valuations`}
              label="Retour aux valorisations du plan"
            />
          ) : null
        }
      >
        <Card className="border-dashed border-amber-300">
          <CardContent className="py-6">
            <p className="text-sm">
              Le payload Monte Carlo (paths, convergence, histogram) est absent ou malformé. Une
              re-simulation peut être nécessaire.
            </p>
            <p className="text-muted-foreground mt-2 font-mono text-xs">
              {vizParse.error.issues[0]?.message}
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
  const viz: VisualizationPayload = vizParse.data;

  // Inputs originaux : reconstitués depuis payload_sent (envoyé au moteur).
  const payload = run.payloadSent as {
    market?: { S0?: number; sigma?: number; r?: number };
    instrument?: { strike?: number; T?: number };
    config?: { num_paths?: number };
  } | null;

  const inputs = {
    S0: Number(payload?.market?.S0 ?? 0),
    K: Number(payload?.instrument?.strike ?? 0),
    sigma: Number(payload?.market?.sigma ?? 0),
    r: Number(payload?.market?.r ?? 0),
    T: Number(payload?.instrument?.T ?? 0),
    numPaths: Number(payload?.config?.num_paths ?? viz.total_paths),
  };

  const fairValuePerUnit = Number(
    response?.fair_value_per_unit ?? run.results?.fairValuePerInstrument ?? 0,
  );

  return (
    <PageShell
      title={
        <span className="flex items-center gap-3">
          {run.planName ?? 'Valorisation'} · Monte Carlo
          <Badge variant="outline" className="font-mono text-xs">
            {run.id.slice(0, 8)}
          </Badge>
          <Badge className="border-emerald-300 bg-emerald-100 font-mono text-xs text-emerald-900">
            DONE
          </Badge>
        </span>
      }
      description={`Calculée le ${completedLabel} · ${run.engineVersion ?? 'engine ?'} · seed ${(run.parameters as { seed?: number } | null)?.seed ?? 'auto'}`}
      actions={
        run.planId ? (
          <BackLink
            href={`/dashboard/plans/${run.planId}/valuations`}
            label="Retour aux valorisations du plan"
          />
        ) : null
      }
    >
      <MonteCarloViewer
        run={{
          fair_value_per_unit: fairValuePerUnit,
          std_error: response?.std_error,
          visualization: viz,
          greeks: response?.greeks ?? undefined,
          input_hash: run.inputHash ?? '',
          engine_version: run.engineVersion ?? 'unknown',
          execution_time_ms: Number(response?.execution_time_ms ?? 0),
          seed: (run.parameters as { seed?: number } | null)?.seed,
        }}
        inputs={inputs}
        enableReplay
      />
    </PageShell>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
    >
      <ArrowLeft className="mr-2 size-4" />
      {label}
    </Link>
  );
}

function statusLabel(status: string): string {
  if (status === 'QUEUED') return "En file d'attente";
  if (status === 'RUNNING') return 'Calcul en cours';
  if (status === 'ERROR') return 'Erreur de calcul';
  return status;
}
