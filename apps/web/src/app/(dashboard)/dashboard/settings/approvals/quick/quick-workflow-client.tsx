'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, ChevronRight, Loader2, ShieldOff, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/shared/PageShell';
import { createWorkflow, deleteWorkflow, updateWorkflow } from '@/server/actions/approvals';
import type { UserForApprover, WorkflowAdminListItem } from '@/server/queries/approvals';

type Mode = 'none' | 'single' | 'multiple';

/**
 * Configuration rapide en 1 question : "Qui valide les attributions ?"
 *
 * 3 modes :
 *  - none     : pas de workflow (workflow par défaut archivé si existe)
 *  - single   : 1 approbateur USER (sélectionnable)
 *  - multiple : N approbateurs (mode ANY ou ALL) sur le rôle APPROVER
 *
 * Pour les cas plus complexes (steps SEQUENTIAL multiples, SLA, escalation),
 * lien "Mode avancé" vers `/dashboard/settings/approvals/new`.
 */
export function QuickWorkflowClient({
  currentDefault,
  availableUsers,
}: {
  currentDefault: WorkflowAdminListItem | undefined;
  availableUsers: UserForApprover[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Détecte le mode courant depuis le workflow existant (heuristique simple)
  const initialMode: Mode = !currentDefault ? 'single' : 'single';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [selectedUserId, setSelectedUserId] = useState<string>(availableUsers[0]?.id ?? '');
  const [requiredApprovals, setRequiredApprovals] = useState<number>(2);

  function handleSubmit() {
    startTransition(async () => {
      try {
        // Cas 1 : pas de workflow → archiver l'existant s'il y en a un
        if (mode === 'none') {
          if (currentDefault) {
            const del = await deleteWorkflow({ workflowId: currentDefault.id });
            if (!del.ok) {
              toast.error(del.error ?? 'Archivage échoué');
              return;
            }
          }
          toast.success('Validation désactivée. Les attributions passeront directement.');
          router.push('/dashboard/settings/approvals');
          router.refresh();
          return;
        }

        // Cas 2 & 3 : créer ou mettre à jour le workflow par défaut
        const stepName = mode === 'single' ? 'Validation' : 'Validation collégiale';
        const stepData =
          mode === 'single'
            ? {
                stepOrder: 1,
                stepName,
                approverType: 'USER' as const,
                approverUserId: selectedUserId,
                mode: 'SEQUENTIAL' as const,
                requiredApprovals: 1,
              }
            : {
                stepOrder: 1,
                stepName,
                approverType: 'ANY_OF_ROLE' as const,
                approverRole: 'APPROVER',
                mode: 'PARALLEL' as const,
                requiredApprovals: Math.max(1, requiredApprovals),
              };

        const payload = {
          name:
            mode === 'single'
              ? 'Validation par 1 approbateur'
              : `Validation collégiale (${requiredApprovals} approbations requises)`,
          description:
            'Workflow configuré via le mode rapide. Pour des étapes multiples, utiliser le mode avancé.',
          appliesTo: 'AWARD_GRANT' as const,
          isActive: true,
          isDefault: true,
          steps: [stepData],
        };

        if (currentDefault) {
          const upd = await updateWorkflow({ workflowId: currentDefault.id, patch: payload });
          if (!upd.ok) {
            toast.error(upd.error ?? 'Mise à jour échouée');
            return;
          }
        } else {
          const res = await createWorkflow(payload);
          if (!res.ok) {
            toast.error(res.error ?? 'Création échouée');
            return;
          }
        }

        toast.success('Circuit d’approbation configuré');
        router.push('/dashboard/settings/approvals');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur inattendue');
      }
    });
  }

  return (
    <PageShell
      title="Configuration rapide"
      description="Définir qui valide les attributions, en 1 question."
      actions={
        <Link
          href="/dashboard/settings/approvals/new"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          Mode avancé <ChevronRight className="ml-0.5 size-3.5" />
        </Link>
      }
    >
      {currentDefault ? (
        <div className="border-primary/20 bg-primary/5 flex items-start gap-2 rounded-md border p-3 text-sm">
          <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">Workflow par défaut actif</div>
            <div className="text-muted-foreground text-xs">
              {currentDefault.name} · {currentDefault.steps_count} étape
              {currentDefault.steps_count > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-amber-400/30 bg-amber-50/50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          Aucun workflow d’approbation actif. Les attributions soumises resteront en statut PROPOSED
          jusqu’à validation manuelle. Configurez ci-dessous.
        </div>
      )}

      <h2 className="text-muted-foreground mt-4 text-sm font-semibold uppercase tracking-wide">
        Qui valide les attributions ?
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Option 1 — Personne */}
        <button
          type="button"
          onClick={() => setMode('none')}
          className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
            mode === 'none'
              ? 'border-primary bg-primary/5 ring-primary/40 ring-1'
              : 'border-border hover:bg-muted/30'
          }`}
        >
          <ShieldOff className="text-muted-foreground size-5" />
          <div className="font-medium">Personne</div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            Les attributions sont validées directement. Pas d’étape d’approbation.
          </div>
        </button>

        {/* Option 2 — 1 personne */}
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
            mode === 'single'
              ? 'border-primary bg-primary/5 ring-primary/40 ring-1'
              : 'border-border hover:bg-muted/30'
          }`}
        >
          <User className="text-muted-foreground size-5" />
          <div className="font-medium">Une personne</div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            Un seul approbateur désigné valide chaque attribution.
          </div>
        </button>

        {/* Option 3 — Plusieurs */}
        <button
          type="button"
          onClick={() => setMode('multiple')}
          className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
            mode === 'multiple'
              ? 'border-primary bg-primary/5 ring-primary/40 ring-1'
              : 'border-border hover:bg-muted/30'
          }`}
        >
          <Users className="text-muted-foreground size-5" />
          <div className="font-medium">Plusieurs personnes</div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            Validation collégiale : N personnes avec le rôle APPROVER doivent approuver.
          </div>
        </button>
      </div>

      {/* Sub-form selon le mode */}
      {mode === 'single' ? (
        <div className="bg-card mt-4 space-y-2 rounded-lg border p-4">
          <Label htmlFor="quick-user">Approbateur</Label>
          <select
            id="quick-user"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="border-input bg-background h-9 w-full max-w-md rounded-md border px-3 text-sm"
          >
            {availableUsers.length === 0 ? (
              <option value="">Aucun utilisateur dans l’organisation</option>
            ) : (
              availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name ?? u.email} ({u.email})
                </option>
              ))
            )}
          </select>
          <p className="text-muted-foreground text-xs">
            Cette personne recevra un email à chaque nouvelle attribution à valider.
          </p>
        </div>
      ) : null}

      {mode === 'multiple' ? (
        <div className="bg-card mt-4 space-y-2 rounded-lg border p-4">
          <Label htmlFor="quick-required">Nombre d’approbations requises</Label>
          <input
            id="quick-required"
            type="number"
            min={1}
            max={10}
            value={requiredApprovals}
            onChange={(e) => setRequiredApprovals(Number.parseInt(e.target.value, 10) || 1)}
            className="border-input bg-background h-9 w-full max-w-[120px] rounded-md border px-3 text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Tous les membres ayant le rôle <strong>APPROVER</strong> dans l’organisation peuvent
            valider. Il faut au moins <strong>{requiredApprovals}</strong> approbation
            {requiredApprovals > 1 ? 's' : ''} avant que l’attribution passe.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/settings/approvals')}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {currentDefault ? 'Mettre à jour' : 'Activer'}
        </Button>
      </div>
    </PageShell>
  );
}
