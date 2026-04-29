'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAndPropose, createAwardDraft } from '@/server/actions/awards';
import { upsertBeneficiary } from '@/server/actions/beneficiaries';
import { getPoolStatusAction } from './get-pool-status-action';
import { BeneficiaryCombobox, type SelectedBeneficiary } from './BeneficiaryCombobox';
import { ComplianceIssuesDialog } from '@/components/shared/ComplianceIssuesDialog';
import type { PlanForCreation } from '@/server/queries/awards';
import type { ComplianceIssue } from '@/lib/compliance/types';

/**
 * Modale création d'award — Module 3b B3.
 *
 * Form RHF-less (controlled state pour simplicité B3) + validation Zod
 * via createAwardSchema côté Server Action.
 *
 * Étapes UX :
 *   1. Sélection plan → fetch pool status (banner)
 *   2. Recherche bénéficiaire (Combobox) ou création inline (sub-form)
 *   3. Saisie units + dates (auto-calcul expiry selon plan_type)
 *   4. "Créer en brouillon" (DRAFT) ou "Créer et soumettre" (PROPOSED)
 *
 * À la création : toast success + onSuccess() + close.
 */
export function CreateAwardModal({
  open,
  onOpenChange,
  plans,
  onSuccess,
  initialBeneficiary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: PlanForCreation[];
  onSuccess: () => void;
  /**
   * Pré-remplit le bénéficiaire à l'ouverture (Module 4 B4 — bouton
   * « Nouvelle attribution » depuis la page détail bénéficiaire).
   */
  initialBeneficiary?: SelectedBeneficiary;
}) {
  const [pending, startTransition] = useTransition();

  // Form state
  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? '');
  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [planId, plans]);
  const [pool, setPool] = useState<{
    remaining: number;
    allocated: number;
    poolSize: number;
  } | null>(null);
  const [beneficiary, setBeneficiary] = useState<SelectedBeneficiary | null>(
    initialBeneficiary ?? null,
  );
  const [createMode, setCreateMode] = useState<{ email: string } | null>(null);
  const [newBenName, setNewBenName] = useState('');
  const [newBenType, setNewBenType] = useState<
    'EMPLOYEE' | 'OFFICER' | 'CONSULTANT' | 'ADVISOR' | 'OTHER'
  >('EMPLOYEE');
  const [units, setUnits] = useState<number>(0);
  const [exercisePrice, setExercisePrice] = useState<string>('');
  const [grantDate, setGrantDate] = useState<string>(today());
  const [vestingStartDate, setVestingStartDate] = useState<string>(today());
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [complianceBlock, setComplianceBlock] = useState<ComplianceIssue[] | null>(null);

  // Pool fetch sur changement de plan — async legit, set conditionnel
  useEffect(() => {
    if (!planId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPool((prev) => (prev === null ? prev : null));
      return;
    }
    startTransition(async () => {
      const res = await getPoolStatusAction(planId);
      setPool(res);
    });
  }, [planId]);

  // Auto-fill exercisePrice depuis le plan (seulement si différent — évite cascade)
  useEffect(() => {
    const target = selectedPlan?.exercise_price != null ? String(selectedPlan.exercise_price) : '';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExercisePrice((prev) => (prev === target ? prev : target));
  }, [selectedPlan]);

  // Auto-calcul expiry_date selon plan_type
  useEffect(() => {
    let target = '';
    if (selectedPlan && grantDate) {
      const opts = ['BSPCE', 'STOCK_OPTION', 'BSA', 'SAR'];
      if (opts.includes(selectedPlan.plan_type)) {
        target = addYears(grantDate, 10);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpiryDate((prev) => (prev === target ? prev : target));
  }, [selectedPlan, grantDate]);

  // Validation
  const remainingAfter = pool ? pool.remaining - units : 0;
  const poolExceeded = pool != null && units > pool.remaining;
  const formValid =
    !!planId && !!beneficiary && units > 0 && !poolExceeded && !!grantDate && !createMode; // si on est en train de créer un nouveau bénéficiaire, on ne peut pas submit

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleCreateNewBeneficiary(email: string) {
    setCreateMode({ email });
    setNewBenName('');
    setNewBenType('EMPLOYEE');
  }

  function handleConfirmNewBeneficiary() {
    if (!createMode || !newBenName.trim()) return;
    startTransition(async () => {
      const res = await upsertBeneficiary({
        email: createMode.email,
        fullName: newBenName.trim(),
        type: newBenType,
        taxResidence: 'FR',
      });
      if (res.ok) {
        toast.success(
          res.isNew ? `Bénéficiaire créé : ${res.fullName}` : 'Bénéficiaire existant trouvé',
        );
        setBeneficiary({ id: res.id, fullName: res.fullName, email: res.email });
        setCreateMode(null);
      } else {
        toast.error(`Erreur : ${res.error}`);
      }
    });
  }

  async function submit(initialStatus: 'DRAFT' | 'PROPOSED') {
    if (!planId || !beneficiary) return;
    const payload = {
      planId,
      beneficiaryId: beneficiary.id,
      unitsGranted: units,
      exercisePrice: exercisePrice ? Number(exercisePrice) : undefined,
      grantDate,
      vestingStartDate: vestingStartDate || undefined,
      expiryDate: expiryDate || undefined,
      initialStatus,
    };
    startTransition(async () => {
      const res =
        initialStatus === 'PROPOSED'
          ? await createAndPropose(payload)
          : await createAwardDraft(payload);
      if (res.ok) {
        toast.success(`Attribution créée : ${res.awardNumber}`);
        resetForm();
        onSuccess();
        onOpenChange(false);
      } else if (res.complianceIssues && res.complianceIssues.length > 0) {
        // Bloqué par compliance — l'award peut avoir été créé en DRAFT (le
        // call à createAwardDraft a réussi, c'est la transition vers PROPOSED
        // qui a failé). On laisse la modale ouverte, on affiche le dialog
        // détaillé, et on suggère le retour au statut DRAFT.
        setComplianceBlock(res.complianceIssues);
        toast.error(`Soumission bloquée : ${res.complianceIssues.length} règle(s) de conformité`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function resetForm() {
    setPlanId(plans[0]?.id ?? '');
    setBeneficiary(null);
    setCreateMode(null);
    setNewBenName('');
    setUnits(0);
    setExercisePrice('');
    setGrantDate(today());
    setVestingStartDate(today());
    setExpiryDate('');
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle attribution</DialogTitle>
          <DialogDescription>
            Crée un award et le rattache à un bénéficiaire. Statut initial DRAFT (modifiable plus
            tard) ou PROPOSED (lance le workflow d&apos;approbation).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Plan */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-select">Plan *</Label>
            <select
              id="plan-select"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              data-testid="modal-plan-select"
            >
              <option value="">— Choisir un plan —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.plan_type})
                </option>
              ))}
            </select>
            {selectedPlan && pool ? (
              <div className="bg-muted/40 rounded-md border px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span>Pool restant :</span>
                  <span className="font-mono tabular-nums">
                    {pool.remaining.toLocaleString('fr-FR')} /{' '}
                    {pool.poolSize.toLocaleString('fr-FR')}
                  </span>
                </div>
                {units > 0 ? (
                  <div
                    className={`flex justify-between ${poolExceeded ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    <span>Après cette attribution :</span>
                    <span className="font-mono tabular-nums">
                      {remainingAfter.toLocaleString('fr-FR')}
                      {poolExceeded ? ' (dépassement !)' : ''}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Bénéficiaire */}
          <div className="space-y-1.5">
            <Label>Bénéficiaire *</Label>
            {beneficiary && !createMode ? (
              <div className="flex items-center justify-between rounded-md border bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                <div className="text-sm">
                  <div className="font-medium">{beneficiary.fullName}</div>
                  <div className="text-muted-foreground text-xs">{beneficiary.email}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setBeneficiary(null)}>
                  Changer
                </Button>
              </div>
            ) : createMode ? (
              <div className="bg-muted/30 space-y-2 rounded-md border p-3">
                <p className="text-muted-foreground text-xs">
                  Création d&apos;un nouveau bénéficiaire : <strong>{createMode.email}</strong>
                </p>
                <Input
                  placeholder="Nom complet (ex. Alice Dupont)"
                  value={newBenName}
                  onChange={(e) => setNewBenName(e.target.value)}
                  data-testid="new-beneficiary-name"
                />
                <div className="flex gap-2 text-xs">
                  {(['EMPLOYEE', 'OFFICER', 'CONSULTANT', 'ADVISOR', 'OTHER'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewBenType(t)}
                      className={[
                        'flex-1 rounded border px-2 py-1.5',
                        newBenType === t
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-accent',
                      ].join(' ')}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConfirmNewBeneficiary}
                    disabled={!newBenName.trim() || pending}
                    data-testid="confirm-new-beneficiary"
                  >
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Créer'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateMode(null)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <BeneficiaryCombobox
                value={beneficiary}
                onSelect={setBeneficiary}
                onCreateNew={handleCreateNewBeneficiary}
              />
            )}
          </div>

          {/* Units + price */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="units">Units attribuées *</Label>
              <Input
                id="units"
                type="number"
                min={1}
                value={units || ''}
                onChange={(e) => setUnits(Number(e.target.value) || 0)}
                placeholder="Ex. 1000"
                className={poolExceeded ? 'border-destructive' : undefined}
                data-testid="modal-units-input"
              />
              {poolExceeded ? (
                <p className="text-destructive text-xs">
                  Dépasse le pool restant ({pool?.remaining.toLocaleString('fr-FR')}).
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="strike">Strike (option)</Label>
              <Input
                id="strike"
                type="number"
                min={0}
                step="any"
                value={exercisePrice}
                onChange={(e) => setExercisePrice(e.target.value)}
                placeholder="Hérité du plan"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="grant-date">Date d&apos;attribution *</Label>
              <Input
                id="grant-date"
                type="date"
                value={grantDate}
                onChange={(e) => setGrantDate(e.target.value)}
                data-testid="modal-grant-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vesting-start">Début vesting</Label>
              <Input
                id="vesting-start"
                type="date"
                value={vestingStartDate}
                min={grantDate}
                onChange={(e) => setVestingStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry">Expiration</Label>
              <Input
                id="expiry"
                type="date"
                value={expiryDate}
                min={grantDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                placeholder="Auto selon plan"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          <Button
            variant="outline"
            onClick={() => submit('DRAFT')}
            disabled={!formValid || pending}
            data-testid="submit-draft"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Créer en brouillon'}
          </Button>
          <Button
            onClick={() => submit('PROPOSED')}
            disabled={!formValid || pending}
            data-testid="submit-proposed"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Créer et soumettre'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ComplianceIssuesDialog
        open={complianceBlock != null}
        onOpenChange={(o) => !o && setComplianceBlock(null)}
        issues={complianceBlock ?? []}
        title="Soumission bloquée par la conformité"
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
