import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { uuidSchema } from '@equity/shared';
import { PageShell } from '@/components/shared/PageShell';
import { BeneficiaryStatusBadge } from '@/components/shared/beneficiary-status-badge';
import { BeneficiaryTypeBadge } from '@/components/shared/beneficiary-type-badge';
import { BeneficiaryDetailClient } from './beneficiary-detail-client';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { getBeneficiaryDetail } from '@/server/queries/beneficiaries';
import { listPlansForAwardCreation } from '@/server/queries/awards';

export const metadata: Metadata = { title: 'Bénéficiaire · Capiwise' };

/**
 * Route /dashboard/beneficiaries/[id] — Module 4 B4.
 *
 * Server Component qui :
 *   1. requirePermission('beneficiaries.read')
 *   2. parse UUID + getBeneficiaryDetail (6 queries parallèles)
 *   3. notFound() si beneficiary inexistant ou soft-deleted
 *   4. Charge permissions + plans pour creating awards
 *   5. Rend BeneficiaryDetailClient avec 4 onglets (Profil/Awards/
 *      Documents/Audit) + EditBeneficiaryModal
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('beneficiaries.read');

  const { id: rawId } = await params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) redirect('/dashboard/beneficiaries');

  const detail = await getBeneficiaryDetail(idCheck.data);
  if (!detail) notFound();

  const [canUpdate, canDelete, canInvite, canLifecycle, canPropose] = await Promise.all([
    hasPermission('beneficiaries.update'),
    hasPermission('beneficiaries.delete'),
    hasPermission('beneficiaries.invite'),
    hasPermission('beneficiaries.lifecycle'),
    hasPermission('awards.propose'),
  ]);
  const plans = canPropose ? await listPlansForAwardCreation() : [];

  const bene = detail.beneficiary;
  const fullName = `${bene.first_name} ${bene.last_name}`.trim() || bene.email;
  const subtitle = bene.job_title ?? bene.beneficiary_type;

  return (
    <PageShell
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span>{fullName}</span>
          <BeneficiaryStatusBadge status={bene.status} />
          <BeneficiaryTypeBadge type={bene.beneficiary_type} />
          {bene.invited_at ? (
            <span
              className="text-muted-foreground inline-flex items-center gap-1 text-xs"
              title={`Invité le ${bene.invited_at.slice(0, 10)} (${bene.invitation_count ?? 1}×)`}
            >
              <Mail className="size-3" />
              Invité
            </span>
          ) : null}
          {bene.first_login_at ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-emerald-600"
              title={`Premier login le ${bene.first_login_at.slice(0, 10)}`}
            >
              <CheckCircle2 className="size-3" />
              Connecté
            </span>
          ) : null}
        </span>
      }
      description={
        <span>
          {bene.email} · {subtitle}
          {bene.status === 'terminated' && bene.termination_date
            ? ` · Sorti le ${formatDate(bene.termination_date)}`
            : ''}
        </span>
      }
      actions={
        <Link
          href="/dashboard/beneficiaries"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-1 size-4" />
          Retour à la liste
        </Link>
      }
    >
      <BeneficiaryDetailClient
        detail={detail}
        plans={plans}
        perms={{ canUpdate, canDelete, canInvite, canLifecycle, canPropose }}
      />
    </PageShell>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
