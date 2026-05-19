import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/rbac';
import { listSignatureWorkflows } from '@/server/actions/signature-settings';
import { EditWorkflowClient } from './edit-client';

export const metadata: Metadata = { title: 'Modifier workflow · Capiwise' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) redirect('/select-org');

  const res = await listSignatureWorkflows();
  if (!res.ok) return <div className="text-destructive p-8">{res.error}</div>;

  const workflow = res.workflows.find((w) => w.id === id);
  if (!workflow) notFound();

  return <EditWorkflowClient workflow={workflow} />;
}
