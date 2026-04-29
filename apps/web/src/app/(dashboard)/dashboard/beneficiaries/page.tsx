import type { Metadata } from 'next';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { listBeneficiaries, type ListBeneficiariesFilters } from '@/server/queries/beneficiaries';
import { BeneficiariesListClient } from './beneficiaries-list-client';

export const metadata: Metadata = { title: 'Bénéficiaires · Capiwise' };

/**
 * Route /dashboard/beneficiaries — Module 4 B3.
 *
 * Server Component qui :
 *   1. requirePermission('beneficiaries.read')
 *   2. Lit les filtres depuis searchParams
 *   3. Fetch listBeneficiaries(filters) + flags permissions en parallèle
 *   4. Rend BeneficiariesListClient
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('beneficiaries.read');

  const sp = await searchParams;
  const filters: ListBeneficiariesFilters = {
    search: typeof sp.search === 'string' ? sp.search : undefined,
    statuses: parseList(sp.status) as ('active' | 'on_leave' | 'terminated')[] | undefined,
    types: parseList(sp.type),
    contractTypes: parseList(sp.contract),
    hasAwards: sp.hasAwards === 'with' || sp.hasAwards === 'without' ? sp.hasAwards : undefined,
    taxResidentFrance: sp.taxFR === 'yes' || sp.taxFR === 'no' ? sp.taxFR : undefined,
    hireDateFrom: typeof sp.hireFrom === 'string' ? sp.hireFrom : undefined,
    hireDateTo: typeof sp.hireTo === 'string' ? sp.hireTo : undefined,
  };

  const [beneficiaries, canCreate, canUpdate, canDelete, canInvite, canLifecycle, canBulkImport] =
    await Promise.all([
      listBeneficiaries(filters),
      hasPermission('beneficiaries.create'),
      hasPermission('beneficiaries.update'),
      hasPermission('beneficiaries.delete'),
      hasPermission('beneficiaries.invite'),
      hasPermission('beneficiaries.lifecycle'),
      hasPermission('beneficiaries.bulk_import'),
    ]);

  return (
    <BeneficiariesListClient
      beneficiaries={beneficiaries}
      filters={filters}
      perms={{ canCreate, canUpdate, canDelete, canInvite, canLifecycle, canBulkImport }}
    />
  );
}

function parseList(raw: string | string[] | undefined): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  return raw.split(',').filter(Boolean);
}
