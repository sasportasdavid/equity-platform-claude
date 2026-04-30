'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Send } from 'lucide-react';
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
import { sendDocumentForSignature } from '@/server/actions/documents';
import type { CompanyRepresentativeOption } from '@/server/queries/documents';

/**
 * Module 6 B4 — Modale "Envoyer pour signature" (Yousign).
 *
 * Form pattern useState (cohérent avec DecisionDialog/TransitionLifecycleDialog),
 * pas de RHF — la complexité est faible.
 *
 * - Signer 1 (BENEFICIARY) : pré-rempli + read-only sur full_name/email,
 *   modifiable sur phone (optionnel)
 * - Signer 2 (COMPANY_REPRESENTATIVE) : optionnel via toggle, combobox des
 *   users OWNER/ADMIN_HR de l'org
 * - Mode signature : SEQUENTIAL (default) / PARALLEL
 * - expiryDays : 1 - 90 (default 30, alignée avec recommandations Yousign)
 *
 * À submit : appelle sendDocumentForSignature, toast + close + router.refresh.
 */
export function SendForSignatureDialog({
  open,
  onOpenChange,
  documentId,
  documentNumber,
  beneficiary,
  companyRepresentatives,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentNumber: string | null;
  beneficiary: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
  };
  companyRepresentatives: CompanyRepresentativeOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [signer1Phone, setSigner1Phone] = useState<string>(beneficiary.phone ?? '');
  const [includeSigner2, setIncludeSigner2] = useState(false);
  const [signer2UserId, setSigner2UserId] = useState<string>('');
  const [signingMode, setSigningMode] = useState<'SEQUENTIAL' | 'PARALLEL'>('SEQUENTIAL');
  const [expiryDays, setExpiryDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  const signer2 = companyRepresentatives.find((r) => r.user_id === signer2UserId);
  const canSubmit =
    !pending &&
    !!beneficiary.email &&
    !!beneficiary.fullName.trim() &&
    expiryDays >= 1 &&
    expiryDays <= 90 &&
    (!includeSigner2 || (!!signer2 && !!signer2.email));

  function reset() {
    setSigner1Phone(beneficiary.phone ?? '');
    setIncludeSigner2(false);
    setSigner2UserId('');
    setSigningMode('SEQUENTIAL');
    setExpiryDays(30);
    setError(null);
  }

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  function handleSubmit() {
    setError(null);
    const signers: Array<{
      type: 'BENEFICIARY' | 'COMPANY_REPRESENTATIVE';
      email: string;
      fullName: string;
      signingOrder: number;
      phone?: string;
      beneficiaryId?: string;
      userId?: string;
    }> = [
      {
        type: 'BENEFICIARY',
        email: beneficiary.email,
        fullName: beneficiary.fullName,
        signingOrder: 1,
        phone: signer1Phone.trim() || undefined,
        beneficiaryId: beneficiary.id,
      },
    ];
    if (includeSigner2 && signer2) {
      signers.push({
        type: 'COMPANY_REPRESENTATIVE',
        email: signer2.email,
        fullName: signer2.full_name ?? signer2.email,
        signingOrder: 2,
        userId: signer2.user_id,
      });
    }

    startTransition(async () => {
      const res = await sendDocumentForSignature({
        documentId,
        signers,
        signingOrder: signingMode,
        expiryDays,
      });
      if (res.ok) {
        toast.success(`Envoyé pour signature — Yousign ${res.yousignProcedureId.slice(0, 12)}…`);
        handleClose(false);
        router.refresh();
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Envoyer pour signature</DialogTitle>
          <DialogDescription>
            Document {documentNumber ?? documentId.slice(0, 8)} — Yousign envoie un email avec un
            lien de signature OTP par email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Signer 1 — Bénéficiaire */}
          <section className="space-y-2 rounded-md border p-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Signataire 1 — Bénéficiaire</h3>
              <span className="text-muted-foreground text-xs">Ordre 1</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Nom complet</Label>
                <Input value={beneficiary.fullName} disabled className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={beneficiary.email} disabled className="text-sm" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="signer1-phone" className="text-xs">
                  Téléphone (optionnel)
                </Label>
                <Input
                  id="signer1-phone"
                  type="tel"
                  value={signer1Phone}
                  onChange={(e) => setSigner1Phone(e.target.value)}
                  placeholder="+33 6 12 34 56 78"
                  className="text-sm"
                />
              </div>
            </div>
          </section>

          {/* Signer 2 — Représentant société */}
          <section className="space-y-2 rounded-md border p-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Signataire 2 — Représentant société</h3>
              <label className="text-muted-foreground inline-flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeSigner2}
                  onChange={(e) => setIncludeSigner2(e.target.checked)}
                />
                Ajouter un signataire société
              </label>
            </div>
            {includeSigner2 ? (
              <div className="space-y-1">
                <Label htmlFor="signer2-user" className="text-xs">
                  Utilisateur OWNER / ADMIN_HR de l&apos;organisation
                </Label>
                <select
                  id="signer2-user"
                  value={signer2UserId}
                  onChange={(e) => setSigner2UserId(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">— Sélectionner un représentant —</option>
                  {companyRepresentatives.map((r) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.full_name ? `${r.full_name} — ${r.email}` : r.email} ({r.roles.join(', ')})
                    </option>
                  ))}
                </select>
                {companyRepresentatives.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Aucun user avec rôle OWNER/ADMIN_HR actif. Inviter via Settings → Membres.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Le bénéficiaire signera seul (signature unilatérale).
              </p>
            )}
          </section>

          {/* Configuration */}
          <section className="space-y-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Configuration</h3>

            <div className="space-y-1">
              <Label className="text-xs">Mode de signature</Label>
              <div className="flex gap-4 text-sm">
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="signingMode"
                    value="SEQUENTIAL"
                    checked={signingMode === 'SEQUENTIAL'}
                    onChange={() => setSigningMode('SEQUENTIAL')}
                  />
                  Séquentielle (signer 1 puis 2)
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="signingMode"
                    value="PARALLEL"
                    checked={signingMode === 'PARALLEL'}
                    onChange={() => setSigningMode('PARALLEL')}
                  />
                  Parallèle (tous en même temps)
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="expiry" className="text-xs">
                Délai d&apos;expiration (jours)
              </Label>
              <Input
                id="expiry"
                type="number"
                min={1}
                max={90}
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value) || 30)}
                className="w-32 text-sm"
              />
            </div>
          </section>

          {/* Banner info */}
          <div className="bg-muted/30 flex items-start gap-2 rounded-md border p-3 text-xs">
            <AlertCircle className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
            <p>
              Une fois envoyé, les signataires recevront un email Yousign avec un lien de signature.
              Le statut sera mis à jour automatiquement via webhook (signed/declined).
            </p>
          </div>

          {error ? (
            <div className="bg-destructive/10 text-destructive rounded-md p-2 text-xs">{error}</div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Envoyer pour signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
