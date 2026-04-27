'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ROLE_LABELS, type Role } from '@equity/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { setActiveOrg } from '@/server/actions/auth';

type OrgEntry = {
  org_id: string;
  org_name: string;
  roles: string[];
  is_active: boolean;
};

/**
 * Module 2 §5.5 — dropdown de switch d'organisation. Visible seulement si
 * le user est membre de ≥ 2 orgs ACTIVE.
 *
 * Charge la liste via une query Supabase côté client (RLS : memberships_select_self
 * autorise le self-read). Les noms d'org viennent du join organizations
 * (RLS : orgs_select_member autorise le user à voir toutes ses orgs).
 */
export function OrgSwitcher({
  activeOrgId,
  activeOrgName,
}: {
  activeOrgId: string | null;
  activeOrgName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const { data: orgs } = useQuery<OrgEntry[]>({
    queryKey: ['my-orgs'],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('memberships')
        .select('org_id, roles, organizations(name)')
        .eq('status', 'ACTIVE');
      if (error || !data) return [];
      return data.map((row) => ({
        org_id: row.org_id,
        org_name: (row.organizations as { name?: string } | null)?.name ?? 'Sans nom',
        roles: (row.roles ?? []) as string[],
        is_active: row.org_id === activeOrgId,
      }));
    },
    staleTime: 60_000,
  });

  if (!orgs || orgs.length <= 1) return null;

  function onSelect(orgId: string) {
    if (pending || orgId === activeOrgId) return;
    startTransition(async () => {
      const result = await setActiveOrg({ orgId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5" data-testid="org-switcher">
            <Building2 className="size-4" />
            <span className="max-w-[160px] truncate">{activeOrgName ?? 'Organisation'}</span>
            <ChevronsUpDown className="size-3.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-[260px]">
        <DropdownMenuLabel>Changer d’organisation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.org_id}
            onClick={() => onSelect(org.org_id)}
            disabled={pending}
            className="flex items-start justify-between gap-2"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">{org.org_name}</span>
              <span className="text-muted-foreground text-[11px]">
                {org.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(' · ') || 'sans rôle'}
              </span>
            </div>
            {org.is_active ? <Check className="text-primary size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
