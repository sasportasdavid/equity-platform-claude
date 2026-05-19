import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/rbac';
import { QuickSignatureWorkflowClient } from './quick-client';

export const metadata: Metadata = { title: 'Configuration rapide signature · Capiwise' };

const PLAN_TYPES = ['BSPCE', 'AGA', 'BSA', 'STOCK_OPTIONS', 'RSU', 'PHANTOM', 'SAR', 'ESPP'];

export default async function Page() {
  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) redirect('/select-org');

  return <QuickSignatureWorkflowClient planTypes={PLAN_TYPES} />;
}
