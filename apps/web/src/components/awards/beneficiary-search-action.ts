'use server';

import { hasPermission } from '@/lib/auth/rbac';
import { searchBeneficiaries } from '@/server/queries/awards';

/**
 * Wrapper Server Action minimal pour exposer searchBeneficiaries au combobox
 * client. Permission `beneficiaries.read` ou `awards.propose` suffisante
 * (les awards.proposers ont besoin de chercher des bénéficiaires).
 */
export async function searchBeneficiariesAction(query: string) {
  const can =
    (await hasPermission('beneficiaries.read')) || (await hasPermission('awards.propose'));
  if (!can) return [];
  return searchBeneficiaries(query);
}
