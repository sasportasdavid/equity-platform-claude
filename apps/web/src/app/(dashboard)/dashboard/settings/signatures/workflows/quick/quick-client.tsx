'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, Loader2, User, Users, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/shared/PageShell';
import { createSignatureWorkflow } from '@/server/actions/signature-settings';

type SignerMode = 'beneficiary_only' | 'beneficiary_then_owner' | 'beneficiary_only_admin_approves';

/**
 * Configuration rapide signature — 1 question principale "Qui signe ?"
 *
 * 3 modes correspondant aux ~80% cas réels :
 *   - beneficiary_only : 1 signataire = bénéficiaire (default Yousign)
 *   - beneficiary_then_owner : 2 signataires séquentiels (bénéficiaire puis OWNER)
 *   - beneficiary_only_admin_approves : Idem solo bénéf + cosignataire OWNER en
 *     parallèle pour authentifier
 *
 * Le scope (quel plan_type ce workflow s'applique) est configurable optionnellement.
 * Si rien sélectionné → workflow default org.
 */
export function QuickSignatureWorkflowClient({ planTypes }: { planTypes: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('Signature standard');
  const [signerMode, setSignerMode] = useState<SignerMode>('beneficiary_only');
  const [expiryDays, setExpiryDays] = useState(14);
  const [appliesPlanTypes, setAppliesPlanTypes] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(true);

  function togglePlanType(pt: string) {
    setAppliesPlanTypes((prev) =>
      prev.includes(pt) ? prev.filter((x) => x !== pt) : [...prev, pt],
    );
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    startTransition(async () => {
      const signers =
        signerMode === 'beneficiary_only'
          ? [{ signerOrder: 1, signerType: 'BENEFICIARY' as const, isRequired: true }]
          : signerMode === 'beneficiary_then_owner'
            ? [
                { signerOrder: 1, signerType: 'BENEFICIARY' as const, isRequired: true },
                {
                  signerOrder: 2,
                  signerType: 'ROLE' as const,
                  signerRole: 'OWNER',
                  isRequired: true,
                },
              ]
            : [
                { signerOrder: 1, signerType: 'BENEFICIARY' as const, isRequired: true },
                {
                  signerOrder: 2,
                  signerType: 'ROLE' as const,
                  signerRole: 'OWNER',
                  isRequired: true,
                },
              ];

      const signingOrder =
        signerMode === 'beneficiary_only_admin_approves' ? 'PARALLEL' : 'SEQUENTIAL';

      const res = await createSignatureWorkflow({
        name: name.trim(),
        description:
          signerMode === 'beneficiary_only'
            ? 'Workflow simple : le bénéficiaire signe seul.'
            : signerMode === 'beneficiary_then_owner'
              ? 'Workflow séquentiel : le bénéficiaire signe d’abord, puis l’OWNER contresigne.'
              : 'Workflow parallèle : bénéficiaire + OWNER signent en même temps.',
        appliesPlanTypes,
        appliesTemplateCodes: [],
        expiryDays,
        signingOrder,
        reminderDays: 3,
        isDefault,
        isActive: true,
        signers,
      });

      if (res.ok) {
        toast.success('Workflow de signature créé');
        router.push('/dashboard/settings/signatures');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <PageShell
      title="Configuration rapide signature"
      description="Définir qui signe les documents, en 1 question."
      actions={
        <Link
          href="/dashboard/settings/signatures/workflows/new"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          Mode avancé <ChevronRight className="ml-0.5 size-3.5" />
        </Link>
      }
    >
      {/* Nom */}
      <section className="bg-card space-y-2 rounded-lg border p-4">
        <Label htmlFor="wf-name">Nom du workflow</Label>
        <Input
          id="wf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
      </section>

      {/* Question 1 — Qui signe ? */}
      <h2 className="text-muted-foreground mt-4 text-sm font-semibold uppercase tracking-wide">
        Qui doit signer les documents ?
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setSignerMode('beneficiary_only')}
          className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
            signerMode === 'beneficiary_only'
              ? 'border-primary bg-primary/5 ring-primary/40 ring-1'
              : 'border-border hover:bg-muted/30'
          }`}
        >
          <User className="text-muted-foreground size-5" />
          <div className="font-medium">Bénéficiaire seul</div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            Seul le bénéficiaire signe le document. Plus rapide, recommandé pour la plupart des cas.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSignerMode('beneficiary_then_owner')}
          className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
            signerMode === 'beneficiary_then_owner'
              ? 'border-primary bg-primary/5 ring-primary/40 ring-1'
              : 'border-border hover:bg-muted/30'
          }`}
        >
          <Users className="text-muted-foreground size-5" />
          <div className="font-medium">Bénéficiaire puis OWNER</div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            Signature séquentielle : le bénéficiaire signe d&apos;abord, puis l&apos;OWNER de
            l&apos;org contresigne.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSignerMode('beneficiary_only_admin_approves')}
          className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
            signerMode === 'beneficiary_only_admin_approves'
              ? 'border-primary bg-primary/5 ring-primary/40 ring-1'
              : 'border-border hover:bg-muted/30'
          }`}
        >
          <UserCheck className="text-muted-foreground size-5" />
          <div className="font-medium">En parallèle</div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            Bénéficiaire + OWNER signent simultanément. Pratique pour gagner du temps.
          </div>
        </button>
      </div>

      {/* Délai */}
      <section className="bg-card mt-4 space-y-2 rounded-lg border p-4">
        <Label htmlFor="expiry">Délai pour signer (jours)</Label>
        <input
          id="expiry"
          type="number"
          min={1}
          max={90}
          value={expiryDays}
          onChange={(e) => setExpiryDays(Number.parseInt(e.target.value, 10) || 14)}
          className="border-input bg-background h-9 w-full max-w-[120px] rounded-md border px-3 text-sm tabular-nums"
        />
        <p className="text-muted-foreground text-xs">
          Yousign envoie un rappel automatique après 3 jours par défaut.
        </p>
      </section>

      {/* Scope (plan_type) */}
      <section className="bg-card space-y-3 rounded-lg border p-4">
        <Label>Sur quels plans appliquer ce workflow ?</Label>
        <div className="flex flex-wrap gap-1.5">
          {planTypes.map((pt) => {
            const active = appliesPlanTypes.includes(pt);
            return (
              <button
                key={pt}
                type="button"
                onClick={() => togglePlanType(pt)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {pt}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          Si aucun plan sélectionné, ce workflow s&apos;appliquera à TOUS les types de plan
          (workflow par défaut).
        </p>
      </section>

      {/* Default */}
      <section className="bg-card space-y-2 rounded-lg border p-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <div>
            <div className="font-medium">Définir comme workflow par défaut</div>
            <div className="text-muted-foreground text-xs">
              Sera utilisé pour tous les envois qui ne matchent aucun autre workflow spécifique. Si
              activé, l&apos;ancien default sera automatiquement désactivé.
            </div>
          </div>
        </label>
      </section>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/settings/signatures')}
          disabled={pending}
        >
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Créer le workflow
        </Button>
      </div>
    </PageShell>
  );
}
