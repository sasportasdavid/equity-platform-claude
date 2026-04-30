import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/rbac';
import {
  listPlansForWorkflowAttachment,
  listUsersForWorkflowApprover,
} from '@/server/queries/approvals';
import { WorkflowFormPage } from '@/components/approvals/WorkflowFormPage';

export const metadata: Metadata = { title: 'Nouveau workflow · Capiwise' };

export default async function Page() {
  const user = await requirePermission('approvals.configure');
  const orgId = user.activeOrgId ?? '';

  const [users, plans] = await Promise.all([
    listUsersForWorkflowApprover(orgId),
    listPlansForWorkflowAttachment(),
  ]);

  return <WorkflowFormPage mode="create" availableUsers={users} availablePlans={plans} />;
}
