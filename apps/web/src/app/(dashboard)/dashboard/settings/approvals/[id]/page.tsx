import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/rbac';
import {
  getWorkflowDetailForAdmin,
  listPlansForWorkflowAttachment,
  listUsersForWorkflowApprover,
} from '@/server/queries/approvals';
import { WorkflowFormPage } from '@/components/approvals/WorkflowFormPage';

export const metadata: Metadata = { title: 'Modifier workflow · Capiwise' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('approvals.configure');
  const orgId = user.activeOrgId ?? '';

  const workflow = await getWorkflowDetailForAdmin(id);
  if (!workflow) notFound();

  const [users, plans] = await Promise.all([
    listUsersForWorkflowApprover(orgId),
    listPlansForWorkflowAttachment(id),
  ]);

  return (
    <WorkflowFormPage
      mode="edit"
      workflow={workflow}
      availableUsers={users}
      availablePlans={plans}
    />
  );
}
