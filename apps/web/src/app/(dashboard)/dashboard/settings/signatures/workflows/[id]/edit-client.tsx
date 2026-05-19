'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/shared/PageShell';
import {
  updateSignatureWorkflow,
  type SignatureWorkflowRow,
} from '@/server/actions/signature-settings';

const PLAN_TYPES = ['BSPCE', 'AGA', 'BSA', 'STOCK_OPTIONS', 'RSU', 'PHANTOM', 'SAR', 'ESPP'];

/**
 * Page édition d'un workflow signature existant (V1.X minimum).
 * Le user peut renommer, changer le délai, changer le scope (plan_types),
 * activer/désactiver, et toggle default. Pas de modification des signers V1
 * (recréer un workflow si la composition signataires change).
 */
export function EditWorkflowClient({ workflow }: { workflow: SignatureWorkflowRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? '');
  const [expiryDays, setExpiryDays] = useState(workflow.expiryDays);
  const [reminderDays, setReminderDays] = useState(workflow.reminderDays);
  const [appliesPlanTypes, setAppliesPlanTypes] = useState<string[]>(workflow.appliesPlanTypes);
  const [isDefault, setIsDefault] = useState(workflow.isDefault);
  const [isActive, setIsActive] = useState(workflow.isActive);

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
      const res = await updateSignatureWorkflow({
        workflowId: workflow.id,
        patch: {
          name: name.trim(),
          description: description.trim() || undefined,
          appliesPlanTypes,
          appliesTemplateCodes: workflow.appliesTemplateCodes,
          expiryDays,
          signingOrder: workflow.signingOrder,
          reminderDays,
          isDefault,
          isActive,
          signers: workflow.signers.map((s) => ({
            signerOrder: s.signerOrder,
            signerType: s.signerType,
            signerRole: s.signerRole ?? undefined,
            signerUserId: s.signerUserId ?? undefined,
            isRequired: s.isRequired,
          })),
        },
      });
      if (res.ok) {
        toast.success('Workflow mis à jour');
        router.push('/dashboard/settings/signatures');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <PageShell
      title={`Modifier — ${workflow.name}`}
      description="Renommer, ajuster le délai ou le scope du workflow. Pour changer les signataires, créez un nouveau workflow."
    >
      <section className="bg-card space-y-3 rounded-lg border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="wf-name">Nom *</Label>
          <Input
            id="wf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wf-desc">Description</Label>
          <textarea
            id="wf-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="bg-card space-y-3 rounded-lg border p-4">
        <h3 className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
          Signataires (lecture seule)
        </h3>
        <div className="space-y-1 text-sm">
          {workflow.signers.map((s) => (
            <div
              key={s.id}
              className="bg-muted/30 flex items-center gap-2 rounded border px-3 py-1.5"
            >
              <span className="text-muted-foreground font-mono text-xs">#{s.signerOrder}</span>
              <span>
                {s.signerType === 'BENEFICIARY'
                  ? 'Bénéficiaire'
                  : s.signerType === 'ROLE'
                    ? `Rôle ${s.signerRole}`
                    : `User ${s.signerUserId?.slice(0, 8) ?? '—'}`}
              </span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Ordre de signature :{' '}
          <strong>{workflow.signingOrder === 'SEQUENTIAL' ? 'Séquentiel' : 'Parallèle'}</strong>
        </p>
      </section>

      <section className="bg-card grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="expiry">Délai (jours)</Label>
          <input
            id="expiry"
            type="number"
            min={1}
            max={90}
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number.parseInt(e.target.value, 10) || 14)}
            className="border-input bg-background h-9 w-full max-w-[140px] rounded-md border px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reminder">Rappel après (jours)</Label>
          <input
            id="reminder"
            type="number"
            min={0}
            max={30}
            value={reminderDays}
            onChange={(e) => setReminderDays(Number.parseInt(e.target.value, 10) || 3)}
            className="border-input bg-background h-9 w-full max-w-[140px] rounded-md border px-3 text-sm"
          />
        </div>
      </section>

      <section className="bg-card space-y-2 rounded-lg border p-4">
        <Label>Plans concernés</Label>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_TYPES.map((pt) => {
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
      </section>

      <section className="bg-card space-y-2 rounded-lg border p-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>Workflow par défaut de l&apos;org</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>Workflow actif</span>
        </label>
      </section>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link
          href="/dashboard/settings/signatures"
          className="text-muted-foreground text-sm hover:underline"
        >
          Annuler
        </Link>
        <Button onClick={handleSubmit} disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </div>
    </PageShell>
  );
}
