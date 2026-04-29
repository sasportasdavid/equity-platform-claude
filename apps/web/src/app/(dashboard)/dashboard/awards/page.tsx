import type { Metadata } from 'next';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { listAwards, listPlansForAwardCreation } from '@/server/queries/awards';
import { AwardsListClient } from './awards-list-client';

export const metadata: Metadata = { title: 'Attributions · Capiwise' };

/**
 * Route /dashboard/awards — Module 3b B3.
 *
 * Server Component qui :
 *  1. requirePermission('awards.read.all') (redirect login sinon)
 *  2. Lit les filtres depuis searchParams (status[], planId, search,
 *     beneficiaryType)
 *  3. Fetch listAwards(filters) + listPlansForAwardCreation() en parallèle
 *  4. Rend AwardsListClient avec toutes les données + flags permissions
 *
 * Les row actions (cancel/forfeit/transition) et la modale de création
 * sont des composants client (RHF + dialogs).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('awards.read.all');

  const sp = await searchParams;
  const filters = {
    search: typeof sp.search === 'string' ? sp.search : undefined,
    planId: typeof sp.planId === 'string' ? sp.planId : undefined,
    beneficiaryType: typeof sp.beneficiaryType === 'string' ? sp.beneficiaryType : undefined,
    status: parseStatusFilter(sp.status),
  };

  const [awards, plans, canPropose, canCancel, canModify, canBulkImport] = await Promise.all([
    listAwards(filters),
    listPlansForAwardCreation(),
    hasPermission('awards.propose'),
    hasPermission('awards.cancel'),
    hasPermission('awards.modify'),
    hasPermission('awards.bulk_import'),
  ]);

  return (
    <AwardsListClient
      awards={awards}
      plans={plans}
      filters={filters}
      canPropose={canPropose}
      canCancel={canCancel}
      canModify={canModify}
      canBulkImport={canBulkImport}
    />
  );
}

function parseStatusFilter(raw: string | string[] | undefined): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  return raw.split(',').filter(Boolean);
}
