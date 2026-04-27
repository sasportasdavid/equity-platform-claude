import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/rbac';
import { NewPlanWizard } from './new-plan-wizard';

export const metadata: Metadata = {
  title: 'Nouveau plan · Capiwise',
};

/**
 * Route /dashboard/plans/new — création d'un nouveau plan d'actionnariat
 * via le wizard 7 étapes (Module 3a §2-3).
 *
 * Server Component qui :
 *  1. Vérifie la permission `plans.create` (redirige vers /login si pas
 *     authentifié, vers /dashboard si authentifié sans la permission —
 *     le redirect est géré par `requirePermission`).
 *  2. Charge l'utilisateur courant pour le passer au composant client
 *     (pour audit / display).
 *  3. Rend le wizard côté client avec les vraies Server Actions
 *     (`createPlan` + `saveDraftPlan`) — branchées au commit 4.
 */
export default async function NewPlanPage() {
  await requirePermission('plans.create');
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau plan</h1>
        <p className="text-muted-foreground text-sm">
          Configurez votre plan d&apos;actionnariat en 7 étapes. Les modifications sont enregistrées
          automatiquement (brouillon local + serveur) — vous pouvez fermer l&apos;onglet à tout
          moment et reprendre où vous en étiez.
        </p>
      </header>
      <NewPlanWizard />
    </div>
  );
}
