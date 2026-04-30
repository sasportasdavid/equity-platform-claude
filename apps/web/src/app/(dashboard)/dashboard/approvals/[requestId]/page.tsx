import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { getApprovalRequestDetailFull } from '@/server/queries/approvals';
import { ApprovalRequestDetailClient } from './detail-client';

export const metadata: Metadata = { title: "Demande d'approbation · Capiwise" };

export default async function Page({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const user = await requirePermission('approvals.read');

  const detail = await getApprovalRequestDetailFull(requestId);
  if (!detail) notFound();

  const canConfigure = await hasPermission('approvals.configure');

  return (
    <ApprovalRequestDetailClient
      detail={detail}
      currentUserId={user.id}
      canConfigure={canConfigure}
    />
  );
}
