import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText, Plus } from 'lucide-react';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { listPlans } from '@/server/queries/plans';
import { PlansListClient } from './plans-list-client';

export const metadata: Metadata = {
  title: 'Plans · Capiwise',
};

/**
 * Route /dashboard/plans — page liste de tous les plans de l'org active.
 *
 * Server Component qui :
 *  1. Vérifie `plans.read` (redirige sinon)
 *  2. Vérifie `plans.create` (pour afficher/cacher le bouton « Nouveau plan »)
 *  3. Charge la liste complète via `listPlans()` — RLS filtre déjà par
 *     org_id, donc on récupère tout ce que le user peut voir
 *  4. Passe les données + flag `canCreate` au composant client qui gère
 *     les filtres (search, status, planType) côté client
 *
 * Filtres côté client : performance OK pour V1 (~100 plans max). À refacto
 * en SSR avec searchParams quand on dépassera 1000 plans.
 */
export default async function PlansListPage() {
  await requirePermission('plans.read');
  const canCreate = await hasPermission('plans.create');
  const plans = await listPlans();

  return (
    <PageShell
      title="Plans"
      description="Tous les plans d'actionnariat de votre organisation."
      actions={
        canCreate ? (
          <Link
            href="/dashboard/plans/new"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
            data-testid="plans-list-new-button"
          >
            <Plus className="size-4" />
            Nouveau plan
          </Link>
        ) : null
      }
    >
      {plans.length === 0 ? (
        <EmptyState canCreate={canCreate} />
      ) : (
        <PlansListClient plans={plans} canCreate={canCreate} />
      )}
    </PageShell>
  );
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div
      className="border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16"
      data-testid="plans-list-empty"
    >
      <FileText className="text-muted-foreground size-10" />
      <div className="space-y-1 text-center">
        <p className="font-medium">Aucun plan pour cette organisation</p>
        <p className="text-muted-foreground text-sm">
          {canCreate
            ? 'Créez votre premier plan d’actionnariat pour commencer.'
            : 'Demandez à un OWNER ou un HR_ADMIN de créer un plan.'}
        </p>
      </div>
      {canCreate ? (
        <Link
          href="/dashboard/plans/new"
          className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium"
        >
          <Plus className="size-4" />
          Nouveau plan
        </Link>
      ) : null}
    </div>
  );
}
