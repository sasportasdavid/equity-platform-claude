import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { uuidSchema } from '@equity/shared';
import { PageShell } from '@/components/shared/PageShell';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/rbac';
import { getValuationDetail } from '@/server/queries/valuations';
import { ValuationDetailClient } from './valuation-detail-client';

export const metadata: Metadata = {
  title: 'Valorisation · Capiwise',
};

/**
 * Route /dashboard/plans/[id]/valuations/[runId] — détail d'un run de
 * valorisation (B5.5).
 *
 * Server Component qui :
 *  1. requirePermission('valuations.read') (redirect login sinon)
 *  2. parse les UUID des segments dynamiques
 *  3. fetch via getValuationDetail (RLS filtre par org_id)
 *  4. notFound() si le run n'existe pas / org incorrecte / plan supprimé
 *  5. Si l'id du plan dans l'URL ≠ celui du run, redirect vers la bonne URL
 *     (URL guard — évite qu'un user devine /plans/X/valuations/Y où Y n'est
 *     pas associé à X)
 *  6. Rend ValuationDetailClient avec toutes les données
 */
export default async function ValuationDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  await requirePermission('valuations.read');

  const { id: rawPlanId, runId: rawRunId } = await params;
  const planIdCheck = uuidSchema.safeParse(rawPlanId);
  const runIdCheck = uuidSchema.safeParse(rawRunId);
  if (!planIdCheck.success || !runIdCheck.success) {
    redirect('/dashboard/plans');
  }

  const detail = await getValuationDetail(runIdCheck.data);
  if (!detail) notFound();

  // URL guard : si l'utilisateur a forgé une URL avec un planId ≠ du run,
  // on redirige vers la bonne URL canonique (mieux que 404).
  if (detail.run.planId !== planIdCheck.data) {
    redirect(`/dashboard/plans/${detail.run.planId}/valuations/${detail.run.id}`);
  }

  // B0.5 — Si le run dispose d'une visualisation Monte Carlo (paths_sample +
  // metadata color-coded + convergence + histogram), on route vers la page
  // Module 11 B5 qui utilise le composant `MonteCarloViewer` (Editorial
  // Finance, replay cinématique). Cette page legacy reste utilisée pour les
  // runs sans viz (KPIs + Greeks + sample paths bruts Recharts).
  // Symétrie avec /dashboard/valuations/runs/[runId]/page.tsx:52 qui renvoie
  // ici quand `!includesVisualization`.
  if (detail.run.includesVisualization === true) {
    redirect(`/dashboard/valuations/runs/${detail.run.id}`);
  }

  const planName = detail.plan?.name ?? 'Plan';
  const completedDate = detail.run.completedAt ? new Date(detail.run.completedAt) : null;
  const titleSuffix = completedDate
    ? completedDate.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : 'en cours';

  return (
    <PageShell
      title={
        <span className="flex items-center gap-3">
          {planName} · valorisation
          <Badge variant="outline" className="font-mono text-xs">
            {detail.run.id.slice(0, 8)}
          </Badge>
        </span>
      }
      description={`Calculée le ${titleSuffix}`}
      actions={
        <Link
          href={`/dashboard/plans/${detail.run.planId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          Retour au plan
        </Link>
      }
    >
      <ValuationDetailClient detail={detail} />
    </PageShell>
  );
}
