import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Lock } from 'lucide-react';
import { uuidSchema } from '@equity/shared';
import { PageShell } from '@/components/shared/PageShell';
import { PlanActionsMenu } from '@/components/plans/PlanActionsMenu';
import { RunValuationButton } from '@/components/plans/RunValuationButton';
import { StatusBadge } from '@/components/ui/status-badge';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { getAdaptivePlanTitle } from '@/lib/utils/adaptive-plan-title';
import { listAwards } from '@/server/queries/awards';
import { getPlanDetails } from '@/server/queries/plans';
import { cn } from '@/lib/utils';
import { PlanDetailClient } from './plan-detail-client';

export const metadata: Metadata = {
  title: 'Plan · Capiwise',
};

const PLAN_TYPE_LABEL: Record<string, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Option',
  PHANTOM: 'Phantom',
  BSA: 'BSA',
  RSU: 'RSU',
};

const PLAN_TYPE_TONE: Record<string, 'brass' | 'bond' | 'saffron' | 'slate' | 'title'> = {
  BSPCE: 'brass',
  AGA: 'bond',
  STOCK_OPTION: 'saffron',
  PHANTOM: 'slate',
  BSA: 'brass',
  RSU: 'slate',
};

const PLAN_STATUS_LABEL: Record<
  string,
  { label: string; tone: 'brass' | 'bond' | 'saffron' | 'slate' | 'title' }
> = {
  DRAFT: { label: 'Brouillon', tone: 'slate' },
  ACTIVE: { label: 'Actif', tone: 'bond' },
  CLOSED: { label: 'Clôturé', tone: 'slate' },
};

/**
 * Route /dashboard/plans/[id] — Étape 13 Design System V1.
 *
 * Refonte editorial du Plan Detail (mockup 4) :
 *  - PageShell compound API (breadcrumb + overline + adaptive title +
 *    TitleRule + subtitle + actions)
 *  - Title adaptatif via `getAdaptivePlanTitle` (4 états : pre-cliff /
 *    vesting-active / fully-vested / closed)
 *  - 8 onglets conservés tels quels (Module 3a B4) — refonte editorial
 *    portée uniquement sur le **Synthesis tab** (commits 3+4 Étape 13).
 *    Les 7 autres onglets gardent leur skin actuel (dette V1, Étape 14
 *    polish ou V2).
 */
export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('plans.read');

  const { id: rawId } = await params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) redirect('/dashboard/plans');

  const detail = await getPlanDetails(idCheck.data);
  if (!detail) notFound();

  const [canUpdate, canRunValuation, canCreate, canLock, canDelete, planAwards] = await Promise.all(
    [
      hasPermission('plans.update'),
      hasPermission('valuations.run'),
      hasPermission('plans.create'),
      hasPermission('plans.lock'),
      hasPermission('plans.delete'),
      listAwards({ planId: idCheck.data }),
    ],
  );

  // Calcule la dernière tranche depuis le snapshot vestingSchedule
  const lastTrancheDate =
    detail.vestingSchedule?.tranches && detail.vestingSchedule.tranches.length > 0
      ? detail.vestingSchedule.tranches.reduce((acc, t) =>
          t.vesting_date > acc.vesting_date ? t : acc,
        ).vesting_date
      : null;

  const adaptiveTitle = getAdaptivePlanTitle({
    plan: {
      name: detail.plan.name,
      status: detail.plan.status,
      grant_date: detail.plan.grant_date,
    },
    vestingSchedule: detail.vestingSchedule
      ? {
          cliff_months: detail.vestingSchedule.cliff_months,
          last_tranche_date: lastTrancheDate,
        }
      : null,
  });

  const planTypeLabel = PLAN_TYPE_LABEL[detail.plan.plan_type] ?? detail.plan.plan_type;
  const planTypeTone = PLAN_TYPE_TONE[detail.plan.plan_type] ?? 'slate';
  const planStatusCfg = PLAN_STATUS_LABEL[detail.plan.status] ?? {
    label: detail.plan.status,
    tone: 'slate' as const,
  };

  // Subtitle agrégé : "Pool {N} u. · {company.name} · v{version}"
  const subtitleParts: string[] = [];
  if (detail.plan.pool_size > 0) {
    subtitleParts.push(`Pool ${formatNumber(detail.plan.pool_size)} u.`);
  }
  if (detail.company?.name) {
    subtitleParts.push(detail.company.name);
  }
  subtitleParts.push(`v${detail.plan.version}`);

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: 'Capiwise' },
          { label: 'Plans', href: '/dashboard/plans' },
          { label: detail.plan.name },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>PLAN · {planTypeLabel.toUpperCase()}</PageShell.Overline>
        <PageShell.Title>
          {adaptiveTitle.prefix}
          <PageShell.TitleAccent>{adaptiveTitle.accent}</PageShell.TitleAccent>
        </PageShell.Title>
        <PageShell.TitleRule />
        <PageShell.Subtitle>
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={planStatusCfg.tone} pattern="solid">
              {planStatusCfg.label}
            </StatusBadge>
            <StatusBadge tone={planTypeTone} pattern="solid">
              {planTypeLabel}
            </StatusBadge>
            {detail.plan.is_locked ? (
              <StatusBadge tone="slate" pattern="lock">
                Verrouillé
              </StatusBadge>
            ) : null}
            <span className={cn('text-ink-500 ml-1 font-mono text-xs')}>
              {subtitleParts.join(' · ')}
            </span>
          </span>
        </PageShell.Subtitle>
        <PageShell.Actions>
          <Link
            href="/dashboard/plans"
            className="text-ink-500 hover:text-ink-900 inline-flex items-center text-sm transition-colors"
          >
            <ArrowLeft className="mr-2 size-4" />
            Retour
          </Link>
          {canRunValuation ? <RunValuationButton planId={detail.plan.id} /> : null}
          <PlanActionsMenu
            planId={detail.plan.id}
            isLocked={detail.plan.is_locked}
            canUpdate={canUpdate}
            canLock={canLock}
            canDelete={canDelete}
            canCreate={canCreate}
          />
        </PageShell.Actions>
      </PageShell.Header>

      <PlanDetailClient
        detail={detail}
        canUpdate={canUpdate && !detail.plan.is_locked}
        planAwards={planAwards}
      />
    </PageShell>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}
