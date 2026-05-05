'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ROLE_LABELS, type Role } from '@equity/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { setActiveOrg } from '@/server/actions/auth';
import { cn } from '@/lib/utils';
import { getInitials } from './org-switcher-helpers';

/**
 * PR #35 B3 — Variante "Card" du selector d'organisation pour le footer
 * sidebar (mockup Capiwise page 1).
 *
 * Layout :
 * - Avatar 28px circle avec initiales sur fond brass-500/15 + texte brass-700
 * - Nom org `text-sm ink-900` truncate
 * - Suffixe mono `· N bénéf.` (count bénéficiaires actifs)
 * - Chevron Lucide (multi-org seulement)
 *
 * Logique réutilisée du composant `OrgSwitcher` (Module 2 §5.5) :
 * useQuery TanStack memberships ACTIVE + setActiveOrg + refreshSession +
 * router.refresh.
 *
 * Mode mono-org : affiche avatar + nom + suffixe sans chevron, non
 * cliquable (cf brief §E "pas de menu déroulant inutile").
 */

type OrgEntry = {
  org_id: string;
  org_name: string;
  roles: string[];
  is_active: boolean;
};

export function OrgSwitcherCard({
  activeOrgId,
  activeOrgName,
  beneficiariesCount,
}: {
  activeOrgId: string | null;
  activeOrgName: string | null;
  /** Count bénéficiaires actifs (passé depuis le RSC layout via sidebarCounts). */
  beneficiariesCount: number | null;
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

  const initials = getInitials(activeOrgName);
  const suffix =
    beneficiariesCount !== null && beneficiariesCount !== undefined
      ? `· ${beneficiariesCount} bénéf.`
      : null;
  const isMultiOrg = (orgs?.length ?? 0) > 1;

  // Cellule visuelle commune (avatar + nom + suffix). Le wrapping varie
  // selon mono/multi-org (button avec chevron OU div statique).
  const cell = (
    <>
      <span
        className="bg-brass-500/15 text-brass-700 inline-flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
        aria-hidden="true"
      >
        {initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-ink-900 truncate text-sm font-medium">
          {activeOrgName ?? 'Organisation'}
        </span>
        {suffix ? (
          <span className="text-ink-500 truncate font-mono text-[11px] tabular-nums">{suffix}</span>
        ) : null}
      </div>
    </>
  );

  // Mono-org : pas de chevron, pas de dropdown, juste l'affichage.
  if (!isMultiOrg) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5"
        data-testid="org-switcher-card"
        data-multi-org="false"
      >
        {cell}
      </div>
    );
  }

  // Multi-org : dropdown ouvert vers le haut (footer sidebar).
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-100',
              'hover:bg-paper-200/60 focus-visible:ring-brass-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              pending && 'cursor-wait opacity-60',
            )}
            disabled={pending}
            data-testid="org-switcher-card"
            data-multi-org="true"
          >
            {cell}
            <ChevronsUpDown
              className="text-ink-400 size-3.5 shrink-0"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        }
      />
      <DropdownMenuContent side="top" align="start" className="min-w-[240px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Changer d&rsquo;organisation</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {orgs?.map((org) => (
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
            {org.is_active ? <Check className="text-brass-700 size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
