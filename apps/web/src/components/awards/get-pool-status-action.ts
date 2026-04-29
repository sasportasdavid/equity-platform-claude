'use server';

import { hasPermission } from '@/lib/auth/rbac';
import { getPoolStatus } from '@/server/queries/awards';

/**
 * Wrapper Server Action pour exposer getPoolStatus à la modale client.
 * Permission `plans.read` (le user doit pouvoir lire le plan pour voir son pool).
 */
export async function getPoolStatusAction(planId: string) {
  const can = await hasPermission('plans.read');
  if (!can) return null;
  return getPoolStatus(planId);
}
