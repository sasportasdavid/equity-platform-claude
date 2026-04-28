import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Lock, PlayCircle } from 'lucide-react';
import { uuidSchema } from '@equity/shared';
import { PageShell } from '@/components/shared/PageShell';
import { PlanTypeBadge } from '@/components/plans/shared/PlanTypeBadge';
import { StatusBadge } from '@/components/plans/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { getPlanDetails } from '@/server/queries/plans';
import { PlanDetailClient } from './plan-detail-client';

export const metadata: Metadata = {
  title: 'Plan · Capiwise',
};

/**
 * Route /dashboard/plans/[id] — vue détail complète (8 onglets — B4).
 *
 * Remplace le placeholder B2 (« Plan créé ✓ » + counts cascade). Le
 * placeholder reste utile comme inspiration pour la card Synthèse de B4.
 *
 * Server Component qui :
 *  1. requirePermission('plans.read') (redirect login sinon)
 *  2. parse l'UUID du segment dynamique
 *  3. fetch via getPlanDetails (RLS filtre par org_id)
 *  4. notFound() si plan inexistant ou non accessible
 *  5. rend PlanDetailClient avec toutes les données + flags de permission
 *
 * 8 onglets : Synthèse, État, Performance, IFRS 2, Hypothèses, Départs,
 * Versions, Attributions (cf. spec MODULE_03A_PLANS.md §7).
 */
export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('plans.read');

  const { id: rawId } = await params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) redirect('/dashboard/plans');

  const detail = await getPlanDetails(idCheck.data);
  if (!detail) notFound();

  const canUpdate = await hasPermission('plans.update');

  return (
    <PageShell
      title={
        <span className="flex items-center gap-3">
          {detail.plan.name}
          <PlanTypeBadge planType={detail.plan.plan_type} />
          <StatusBadge status={detail.plan.status} />
          {detail.plan.is_locked ? (
            <Badge variant="outline" className="font-normal">
              <Lock className="mr-1 size-3" />
              Verrouillé
            </Badge>
          ) : null}
          <Badge variant="outline" className="font-mono text-xs">
            v{detail.plan.version}
          </Badge>
        </span>
      }
      description={
        <span className="flex items-center gap-1.5">
          {detail.company ? <span>{detail.company.name} · </span> : null}
          <span>Créé le {formatDateTime(detail.plan.created_at)}</span>
        </span>
      }
      actions={
        <>
          <Link
            href="/dashboard/plans"
            className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
          >
            <ArrowLeft className="mr-2 size-4" />
            Retour à la liste
          </Link>
          <button
            type="button"
            disabled
            title="Disponible en B5"
            className="bg-muted text-muted-foreground inline-flex h-9 cursor-not-allowed items-center justify-center gap-2 rounded-md px-4 text-sm font-medium"
          >
            <PlayCircle className="size-4" />
            Lancer une valorisation
          </button>
        </>
      }
    >
      <PlanDetailClient detail={detail} canUpdate={canUpdate && !detail.plan.is_locked} />
    </PageShell>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
