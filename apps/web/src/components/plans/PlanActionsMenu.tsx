'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Copy, Loader2, Lock, MoreHorizontal, Pencil, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { archivePlan, duplicatePlan, lockPlan, unlockPlan } from '@/server/actions/plan-mutations';

/**
 * Menu d'actions sur un plan (page détail header) — B3.
 *
 * Actions disponibles :
 *   - Dupliquer  : crée une nouvelle version DRAFT du même lineage et navigue
 *                  vers son détail
 *   - Verrouiller / Déverrouiller : toggle is_locked (alterne selon état)
 *   - Archiver   : soft-delete avec confirmation native (window.confirm)
 *
 * Pas d'action « Éditer » en V1 (le wizard de création n'a pas de mode édition
 * structurelle — pour modifier un plan, on duplique puis on édite la copie).
 *
 * Tous les errors retournent un message dans une bannière inline. Au succès,
 * on `router.refresh()` ou navigate selon le cas.
 */
export function PlanActionsMenu({
  planId,
  isLocked,
  canUpdate,
  canLock,
  canDelete,
  canCreate,
}: {
  planId: string;
  isLocked: boolean;
  canUpdate: boolean;
  canLock: boolean;
  canDelete: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDuplicate() {
    setError(null);
    startTransition(async () => {
      const res = await duplicatePlan(planId);
      if (res.ok) {
        router.push(`/dashboard/plans/${res.newPlanId}`);
      } else {
        setError(res.error);
      }
    });
  }

  function handleToggleLock() {
    setError(null);
    startTransition(async () => {
      const res = await (isLocked ? unlockPlan(planId) : lockPlan(planId));
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleArchive() {
    setError(null);
    if (
      !window.confirm(
        'Archiver ce plan ? Il disparaîtra de la liste mais reste récupérable via la corbeille (à venir). Action réversible.',
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await archivePlan(planId);
      if (res.ok) {
        router.push('/dashboard/plans');
      } else {
        setError(res.error);
      }
    });
  }

  // Si l'utilisateur n'a aucune permission de mutation, on ne montre rien
  // (mais le menu reste si au moins une action est dispo).
  const hasAny = canCreate || canLock || canDelete;
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="text-destructive max-w-[280px] truncate text-xs" title={error}>
          {error}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" disabled={pending} data-testid="plan-actions-menu">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MoreHorizontal className="size-4" />
              )}
              <span className="ml-1.5">Actions</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Plan</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />

          {canUpdate ? (
            <DropdownMenuItem
              disabled
              className="text-muted-foreground"
              data-testid="plan-action-edit"
            >
              <Pencil className="mr-2 size-4" />
              Éditer (à venir)
            </DropdownMenuItem>
          ) : null}

          {canCreate ? (
            <DropdownMenuItem
              onClick={handleDuplicate}
              disabled={pending}
              data-testid="plan-action-duplicate"
            >
              <Copy className="mr-2 size-4" />
              Dupliquer
            </DropdownMenuItem>
          ) : null}

          {canLock ? (
            <DropdownMenuItem
              onClick={handleToggleLock}
              disabled={pending}
              data-testid="plan-action-toggle-lock"
            >
              {isLocked ? (
                <>
                  <Unlock className="mr-2 size-4" />
                  Déverrouiller
                </>
              ) : (
                <>
                  <Lock className="mr-2 size-4" />
                  Verrouiller
                </>
              )}
            </DropdownMenuItem>
          ) : null}

          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleArchive}
                disabled={pending || isLocked}
                className="text-destructive focus:text-destructive"
                data-testid="plan-action-archive"
              >
                <Archive className="mr-2 size-4" />
                Archiver
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
