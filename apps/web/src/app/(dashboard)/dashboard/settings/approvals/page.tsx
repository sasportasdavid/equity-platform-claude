import type { Metadata } from 'next';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { listWorkflowsForAdmin } from '@/server/queries/approvals';
import { WorkflowsListClient } from './workflows-list-client';

export const metadata: Metadata = { title: "Circuits d'approbation · Capiwise" };

/**
 * /dashboard/settings/approvals — Module 5 B3.
 *
 * Liste des workflows d'approbation configurables par l'organisation.
 * Permission requise : approvals.read (lecture) ; les actions create/update/
 * delete vérifient approvals.configure côté Server Action.
 */
export default async function Page() {
  await requirePermission('approvals.read');

  const [workflows, canConfigure] = await Promise.all([
    listWorkflowsForAdmin(),
    hasPermission('approvals.configure'),
  ]);

  return <WorkflowsListClient workflows={workflows} canConfigure={canConfigure} />;
}
