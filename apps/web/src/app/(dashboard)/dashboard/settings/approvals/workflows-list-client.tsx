'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, MoreVertical, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageShell } from '@/components/shared/PageShell';
import { deleteWorkflow } from '@/server/actions/approvals';
import type { WorkflowAdminListItem } from '@/server/queries/approvals';

const APPLIES_TO_LABELS: Record<string, string> = {
  AWARD_GRANT: 'Attribution award',
  AWARD_MODIFICATION: 'Modification award',
  EXERCISE_REQUEST: 'Exercice',
  PLAN_CREATION: 'Création plan',
};

const APPLIES_TO_OPTIONS = Object.keys(APPLIES_TO_LABELS);

export function WorkflowsListClient({
  workflows,
  canConfigure,
}: {
  workflows: WorkflowAdminListItem[];
  canConfigure: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filterAppliesTo, setFilterAppliesTo] = useState<Set<string>>(new Set());
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [deleteTarget, setDeleteTarget] = useState<WorkflowAdminListItem | null>(null);

  const filtered = useMemo(() => {
    return workflows.filter((w) => {
      if (filterAppliesTo.size > 0 && !filterAppliesTo.has(w.applies_to)) return false;
      if (filterActive === 'active' && !w.is_active) return false;
      if (filterActive === 'inactive' && w.is_active) return false;
      return true;
    });
  }, [workflows, filterAppliesTo, filterActive]);

  const activeCount = workflows.filter((w) => w.is_active).length;
  const inactiveCount = workflows.length - activeCount;

  function toggleAppliesTo(value: string) {
    const next = new Set(filterAppliesTo);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setFilterAppliesTo(next);
  }

  function handleDelete(wf: WorkflowAdminListItem) {
    startTransition(async () => {
      const res = await deleteWorkflow({ workflowId: wf.id });
      if (res.ok) {
        toast.success(`Workflow "${wf.name}" archivé`);
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <PageShell
      title="Circuits d'approbation"
      description={`${activeCount} workflow${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''} · ${inactiveCount} archivé${inactiveCount > 1 ? 's' : ''}`}
      actions={
        canConfigure ? (
          <div className="flex gap-2">
            <Link
              href="/dashboard/settings/approvals/quick"
              className={buttonVariants({ variant: 'default' })}
            >
              <Sparkles className="mr-2 size-4" /> Configuration rapide
            </Link>
            <Link
              href="/dashboard/settings/approvals/new"
              className={buttonVariants({ variant: 'outline' })}
            >
              <Plus className="mr-2 size-4" /> Mode avancé
            </Link>
          </div>
        ) : null
      }
    >
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {APPLIES_TO_OPTIONS.map((opt) => {
            const active = filterAppliesTo.has(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleAppliesTo(opt)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {APPLIES_TO_LABELS[opt]}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex gap-1.5">
          {(['all', 'active', 'inactive'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilterActive(opt)}
              className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                filterActive === opt
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {opt === 'all' ? 'Tous' : opt === 'active' ? 'Actifs' : 'Archivés'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-semibold">
            {workflows.length === 0
              ? "Aucun circuit d'approbation"
              : 'Aucun workflow ne correspond aux filtres'}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {workflows.length === 0
              ? "Créez le premier pour automatiser les validations d'attribution."
              : "Modifier les filtres ci-dessus pour voir d'autres workflows."}
          </p>
          {workflows.length === 0 && canConfigure ? (
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/dashboard/settings/approvals/quick" className={buttonVariants()}>
                <Sparkles className="mr-2 size-4" /> Configuration rapide
              </Link>
              <Link
                href="/dashboard/settings/approvals/new"
                className={buttonVariants({ variant: 'outline' })}
              >
                <Plus className="mr-2 size-4" /> Mode avancé
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nom</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Plan attaché</th>
                <th className="px-3 py-2 text-left font-medium">Default</th>
                <th className="px-3 py-2 text-left font-medium">Étapes</th>
                <th className="px-3 py-2 text-left font-medium">En cours</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((wf) => (
                <tr
                  key={wf.id}
                  className="hover:bg-muted/30 cursor-pointer border-t transition-colors"
                  onClick={() => router.push(`/dashboard/settings/approvals/${wf.id}`)}
                  data-testid={`workflow-row-${wf.id}`}
                >
                  <td className="px-3 py-3">
                    <div className="font-medium">{wf.name}</div>
                    {wf.description ? (
                      <div className="text-muted-foreground line-clamp-1 text-xs">
                        {wf.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline">
                      {APPLIES_TO_LABELS[wf.applies_to] ?? wf.applies_to}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {wf.plan ? (
                      <Link
                        href={`/dashboard/plans/${wf.plan.id}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {wf.plan.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {wf.is_default ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{wf.steps_count}</td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {wf.active_requests_count > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-700 dark:text-amber-400"
                      >
                        {wf.active_requests_count}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {wf.is_active ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-400 text-emerald-700 dark:text-emerald-400"
                      >
                        Actif
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Archivé</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {canConfigure ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          aria-label="Actions"
                        >
                          <MoreVertical className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/dashboard/settings/approvals/${wf.id}`)}
                          >
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(wf)}
                            disabled={wf.active_requests_count > 0}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 size-4" /> Archiver
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver ce workflow ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le workflow <strong>{deleteTarget?.name}</strong> sera marqué comme archivé (soft
              delete). Il pourra être restauré depuis la DB si besoin. Aucune approval_request en
              cours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={pending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
