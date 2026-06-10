'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlarmClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ListOrdered,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/shared/PageShell';
import {
  deleteSignatureWorkflow,
  updateSignatureSettings,
  type SignatureSettingsRow,
  type SignatureWorkflowRow,
} from '@/server/actions/signature-settings';

const ORDER_LABELS: Record<'SEQUENTIAL' | 'PARALLEL', string> = {
  SEQUENTIAL: 'Séquentiel (un après l’autre)',
  PARALLEL: 'Parallèle (en même temps)',
};

const SIGNER_TYPE_LABELS: Record<'BENEFICIARY' | 'ROLE' | 'USER', string> = {
  BENEFICIARY: 'Bénéficiaire',
  ROLE: 'Rôle',
  USER: 'Personne spécifique',
};

/**
 * UX cible :
 *   - Section A "Paramètres par défaut" en haut, 4 contrôles avec autosave
 *     + indicateur de sauvegarde "✓ Enregistré" qui apparaît 2 sec.
 *   - Section C "Workflows spécifiques" en dessous : liste des workflows avec
 *     badges (plan types ciblés), bouton "Configuration rapide" (wizard) +
 *     bouton "Mode avancé" (form complet).
 *   - Pas de submit button visible côté A — toute modif persiste immédiatement.
 */
export function SignatureSettingsClient({
  initialSettings,
  initialWorkflows,
}: {
  initialSettings: SignatureSettingsRow;
  initialWorkflows: SignatureWorkflowRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState(initialSettings);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SignatureWorkflowRow | null>(null);

  function patchSettings(patch: Partial<SignatureSettingsRow>) {
    const next = { ...settings, ...patch };
    setSettings(next);

    startTransition(async () => {
      const res = await updateSignatureSettings({
        defaultExpiryDays: patch.defaultExpiryDays,
        defaultSigningOrder: patch.defaultSigningOrder,
        requireOwnerCosigner: patch.requireOwnerCosigner,
        reminderDays: patch.reminderDays,
      });

      if (res.ok) {
        setSettings(res.settings);
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2000);
      } else {
        toast.error(res.error);
        // Revert
        setSettings(initialSettings);
      }
    });
  }

  function handleDeleteWorkflow(wf: SignatureWorkflowRow) {
    startTransition(async () => {
      const res = await deleteSignatureWorkflow({ workflowId: wf.id });
      if (res.ok) {
        toast.success(`Workflow "${wf.name}" archivé`);
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const activeWorkflows = initialWorkflows.filter((w) => w.isActive);

  return (
    <PageShell
      title="Paramètres de signature"
      description="Définir les valeurs par défaut et les workflows spécifiques pour les envois Yousign."
    >
      {/* Section A — Defaults org */}
      <section className="bg-card space-y-4 rounded-lg border p-6">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="text-primary size-4" />
              Paramètres par défaut
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Appliqués à tous les envois, sauf si un workflow spécifique override.
            </p>
          </div>
          <div className="text-muted-foreground text-xs">
            {pending ? (
              <span className="flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Enregistrement…
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <Check className="size-3" />
                Enregistré
              </span>
            ) : null}
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Délai d'expiration */}
          <div className="space-y-1.5">
            <Label htmlFor="expiry-days" className="flex items-center gap-1.5">
              <AlarmClock className="text-muted-foreground size-3.5" />
              Délai d&apos;expiration (jours)
            </Label>
            <input
              id="expiry-days"
              type="number"
              min={1}
              max={90}
              value={settings.defaultExpiryDays}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(v) && v >= 1 && v <= 90) {
                  patchSettings({ defaultExpiryDays: v });
                }
              }}
              className="border-input bg-background h-9 w-full max-w-[140px] rounded-md border px-3 text-sm tabular-nums"
            />
            <p className="text-muted-foreground text-xs">
              Combien de jours le signataire a-t-il pour signer avant que la demande n&apos;expire ?
              (1-90)
            </p>
          </div>

          {/* Rappels */}
          <div className="space-y-1.5">
            <Label htmlFor="reminder-days" className="flex items-center gap-1.5">
              <AlarmClock className="text-muted-foreground size-3.5" />
              Rappel après (jours)
            </Label>
            <input
              id="reminder-days"
              type="number"
              min={0}
              max={30}
              value={settings.reminderDays}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(v) && v >= 0 && v <= 30) {
                  patchSettings({ reminderDays: v });
                }
              }}
              className="border-input bg-background h-9 w-full max-w-[140px] rounded-md border px-3 text-sm tabular-nums"
            />
            <p className="text-muted-foreground text-xs">
              Yousign envoie un rappel auto au signataire après ce délai. 0 = désactivé.
            </p>
          </div>

          {/* Ordre de signature */}
          <div className="space-y-2 sm:col-span-2">
            <Label className="flex items-center gap-1.5">
              <ListOrdered className="text-muted-foreground size-3.5" />
              Ordre de signature
            </Label>
            <div className="flex gap-2">
              {(['SEQUENTIAL', 'PARALLEL'] as const).map((order) => (
                <button
                  key={order}
                  type="button"
                  onClick={() => patchSettings({ defaultSigningOrder: order })}
                  className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    settings.defaultSigningOrder === order
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="font-medium">{ORDER_LABELS[order]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Cosignataire obligatoire */}
          <div className="space-y-2 sm:col-span-2">
            <Label className="flex items-center gap-1.5">
              <Users className="text-muted-foreground size-3.5" />
              Cosignataire OWNER
            </Label>
            <label className="hover:bg-muted/20 flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={settings.requireOwnerCosigner}
                onChange={(e) => patchSettings({ requireOwnerCosigner: e.target.checked })}
                className="mt-0.5 size-4"
              />
              <div>
                <div className="font-medium">
                  Toujours ajouter un OWNER de l&apos;org en cosignataire
                </div>
                <div className="text-muted-foreground text-xs">
                  Si activé, chaque envoi pour signature inclura automatiquement le premier OWNER
                  actif comme second signataire (après le bénéficiaire).
                </div>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Section C — Workflows */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Workflows spécifiques</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Override les paramètres par défaut pour certains types de plan ou documents.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/settings/signatures/workflows/quick"
              className={buttonVariants({ variant: 'default', size: 'sm' })}
            >
              <Sparkles className="mr-2 size-4" /> Configuration rapide
            </Link>
            <Link
              href="/dashboard/settings/signatures/workflows/new"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Plus className="mr-2 size-4" /> Mode avancé
            </Link>
          </div>
        </header>

        {activeWorkflows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <h3 className="font-medium">Aucun workflow spécifique</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Les paramètres par défaut ci-dessus seront utilisés pour tous les envois. Créez un
              workflow pour customiser certains types de plan.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeWorkflows.map((wf) => (
              <article
                key={wf.id}
                className="bg-card hover:border-primary/40 group flex items-start gap-3 rounded-lg border p-4 transition-colors"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/settings/signatures/workflows/${wf.id}`}
                      className="text-base font-medium hover:underline"
                    >
                      {wf.name}
                    </Link>
                    {wf.isDefault ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-400 text-emerald-700 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="mr-1 size-3" /> Par défaut
                      </Badge>
                    ) : null}
                  </div>
                  {wf.description ? (
                    <p className="text-muted-foreground text-xs">{wf.description}</p>
                  ) : null}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                    <span>
                      {wf.signers.length} signataire{wf.signers.length > 1 ? 's' : ''}
                    </span>
                    <span>·</span>
                    <span>
                      {wf.signers
                        .map((s) =>
                          s.signerType === 'BENEFICIARY'
                            ? 'Bénéficiaire'
                            : s.signerType === 'ROLE'
                              ? `Rôle ${s.signerRole}`
                              : 'User',
                        )
                        .join(' → ')}
                    </span>
                    <span>·</span>
                    <span>{wf.expiryDays}j d&apos;expiration</span>
                  </div>
                  {(wf.appliesPlanTypes.length > 0 || wf.appliesTemplateCodes.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {wf.appliesPlanTypes.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">
                          {p}
                        </Badge>
                      ))}
                      {wf.appliesTemplateCodes.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Link
                    href={`/dashboard/settings/signatures/workflows/${wf.id}`}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Modifier <ChevronRight className="ml-0.5 inline size-3" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(wf)}
                    className="text-destructive flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="size-3" /> Archiver
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Confirmation archivage */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver ce workflow ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le workflow <strong>{deleteTarget?.name}</strong> sera archivé (soft delete). Les
              envois en cours ne sont pas affectés. Les nouveaux envois fall-back aux paramètres par
              défaut.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDeleteWorkflow(deleteTarget)}
              disabled={pending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lien retour */}
      <div className="pt-4">
        <Link
          href="/dashboard/settings"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          ← Retour aux paramètres
        </Link>
      </div>
    </PageShell>
  );
}

// Réutilisations type-safe pour TypeScript
export type { SignatureSettingsRow as Settings, SignatureWorkflowRow as Workflow };
export { SIGNER_TYPE_LABELS, ORDER_LABELS };
