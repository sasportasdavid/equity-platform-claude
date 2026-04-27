'use client';

import { useQuery } from '@tanstack/react-query';
import type { Permission } from '@equity/shared';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Module 2 §3.4 — toutes les permissions effectives du user actif (rôles
 * ∪ grants \ revokes), via la RPC SQL `user_all_permissions`.
 *
 * Stale-time 5 minutes : les permissions ne changent qu'au switch d'org ou
 * à un refresh manuel, donc on peut cacher généreusement.
 */
export function usePermissions() {
  return useQuery<readonly Permission[]>({
    queryKey: ['permissions', 'current'],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('user_all_permissions');
      if (error || !data) return [];
      return data as Permission[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Variante booléenne : true ssi le user a la permission donnée.
 *
 * Usage type : `const canApprove = usePermission('awards.approve')`.
 */
export function usePermission(perm: Permission): boolean {
  const { data } = usePermissions();
  return data?.includes(perm) ?? false;
}
