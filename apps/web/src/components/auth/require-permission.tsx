'use client';

import type { ReactNode } from 'react';
import type { Permission } from '@equity/shared';
import { usePermission } from '@/hooks/use-permissions';

/**
 * Conditional render based on a permission (Module 2 §3.5).
 *
 * Côté Client only. Les Server Components doivent utiliser `requirePermission`
 * ou `hasPermission` directement depuis `@/lib/auth/rbac` pour bénéficier de
 * la vérification SQL stricte au moment du rendu.
 *
 * Usage :
 *   <RequirePermission permission="awards.approve">
 *     <ApproveButton />
 *   </RequirePermission>
 */
export function RequirePermission({
  permission,
  fallback = null,
  children,
}: {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = usePermission(permission);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
