import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, Lock } from 'lucide-react';
import { uuidSchema } from '@equity/shared';
import { PageShell } from '@/components/shared/PageShell';
import { Badge } from '@/components/ui/badge';
import { PlanTypeBadge } from '@/components/plans/shared/PlanTypeBadge';
import { AwardStatusBadge } from '@/components/awards/AwardStatusBadge';
import { AwardDetailClient } from './award-detail-client';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { getAwardDetail } from '@/server/queries/awards';
import { getApprovalRequestForAward } from '@/server/queries/approvals';
import { getDocumentsForAward, listCompanyRepresentativeOptions } from '@/server/queries/documents';
import { AwardApprovalCard } from '@/components/approvals/AwardApprovalCard';
import type { AwardStatus } from '@equity/shared';

export const metadata: Metadata = { title: 'Attribution · Capiwise' };

/**
 * Route /dashboard/awards/[id] — Module 3b B4.
 *
 * Server Component qui :
 *   1. requirePermission('awards.read.all')
 *   2. parse UUID + getAwardDetail (6 queries parallèles)
 *   3. notFound() si award inexistant ou non accessible
 *   4. Charge les permissions (canCancel/canModify/canPropose) pour piloter
 *      l'affichage des actions header + onglets
 *   5. Rend AwardDetailClient avec 5 onglets (Synthèse/Vesting/Modifications/
 *      PlanRules/Audit)
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('awards.read.all');

  const { id: rawId } = await params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) redirect('/dashboard/awards');

  const detail = await getAwardDetail(idCheck.data);
  if (!detail) notFound();

  const [
    canCancel,
    canModify,
    canPropose,
    canGenerateDoc,
    canVoidDoc,
    approvalRequest,
    documents,
    companyRepresentatives,
  ] = await Promise.all([
    hasPermission('awards.cancel'),
    hasPermission('awards.modify'),
    hasPermission('awards.propose'),
    hasPermission('documents.send_for_signature'),
    hasPermission('documents.void'),
    getApprovalRequestForAward(idCheck.data, user.id),
    getDocumentsForAward(idCheck.data),
    user.activeOrgId ? listCompanyRepresentativeOptions(user.activeOrgId) : Promise.resolve([]),
  ]);

  const planLocked = detail.plan?.is_locked ?? false;
  const planVersion = detail.plan?.version ?? 1;
  const beneficiaryName =
    `${detail.beneficiary?.first_name ?? ''} ${detail.beneficiary?.last_name ?? ''}`.trim() ||
    detail.beneficiary?.email ||
    '—';

  return (
    <PageShell
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span>Attribution {detail.award.award_number ?? detail.award.id.slice(0, 8)}</span>
          <AwardStatusBadge status={detail.award.status as AwardStatus} />
          {detail.plan ? <PlanTypeBadge planType={detail.plan.plan_type} /> : null}
          {planLocked ? (
            <Badge variant="outline" className="font-normal">
              <Lock className="mr-1 size-3" />
              Plan verrouillé
            </Badge>
          ) : null}
          {planVersion > 1 ? (
            <Badge variant="outline" className="font-mono text-xs">
              v{planVersion}
            </Badge>
          ) : null}
        </span>
      }
      description={
        <span>
          {beneficiaryName}
          {detail.plan ? ` · ${detail.plan.name}` : ''}
        </span>
      }
      actions={
        <Link
          href="/dashboard/awards"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          Retour à la liste
        </Link>
      }
    >
      {approvalRequest ? (
        <AwardApprovalCard
          request={approvalRequest}
          award={{
            number: detail.award.award_number,
            beneficiaryName,
            planName: detail.plan?.name ?? null,
            unitsGranted: Number(detail.award.units_granted ?? 0) || null,
          }}
        />
      ) : null}
      <AwardDetailClient
        detail={detail}
        canCancel={canCancel}
        canModify={canModify}
        canPropose={canPropose}
        canGenerateDoc={canGenerateDoc}
        canVoidDoc={canVoidDoc}
        documents={documents}
        companyRepresentatives={companyRepresentatives}
        beneficiary={{
          id: detail.beneficiary?.id ?? '',
          fullName: beneficiaryName,
          email: detail.beneficiary?.email ?? '',
          phone: null,
        }}
      />
    </PageShell>
  );
}
