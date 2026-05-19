import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/rbac';
import { listUsersForWorkflowApprover, listWorkflowsForAdmin } from '@/server/queries/approvals';
import { QuickWorkflowClient } from './quick-workflow-client';

export const metadata: Metadata = { title: "Configuration rapide d'approbation · Capiwise" };

/**
 * /dashboard/settings/approvals/quick — Configuration simple en 1 question.
 *
 * Pour 80% des cas, l'admin veut juste répondre à "Qui valide les attributions ?".
 * Cette page propose 3 options pré-configurées :
 *  - Aucune validation (workflow archivé ou inexistant)
 *  - Validation simple (1 approbateur, mode ANY)
 *  - Validation à plusieurs (N approbateurs requis)
 *
 * Le mode "Avancé" reste accessible via `/dashboard/settings/approvals/new`
 * pour les workflows à étapes multiples (SEQUENTIAL, SLA, escalation...).
 */
export default async function Page() {
  const user = await requirePermission('approvals.configure');
  if (!user.activeOrgId) redirect('/select-org');

  const [workflows, availableUsers] = await Promise.all([
    listWorkflowsForAdmin(),
    listUsersForWorkflowApprover(user.activeOrgId),
  ]);

  // Workflow AWARD_GRANT par défaut (seedé via createOrganization V1.X)
  const currentDefault = workflows.find(
    (w) => w.applies_to === 'AWARD_GRANT' && w.is_default && w.is_active,
  );

  return <QuickWorkflowClient currentDefault={currentDefault} availableUsers={availableUsers} />;
}
