'use client';

import { useState, useTransition } from 'react';
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
import { ComplianceIssuesDialog } from '@/components/shared/ComplianceIssuesDialog';
import {
  createBeneficiary,
  inviteBeneficiary,
  updateBeneficiary,
} from '@/server/actions/beneficiaries';
import type { ComplianceIssue } from '@/lib/compliance/types';
import type { BeneficiaryDetailRow } from '@/server/queries/beneficiaries';

type Beneficiary = BeneficiaryDetailRow['beneficiary'];

const BENE_TYPES = ['EMPLOYEE', 'OFFICER', 'CONSULTANT', 'ADVISOR', 'OTHER'] as const;
const CONTRACT_TYPES = [
  'CDI',
  'CDD',
  'STAGE',
  'ALTERNANCE',
  'CONSULTANT',
  'MANDATAIRE_SOCIAL',
  'AUTRE',
] as const;

/**
 * Form modal bénéficiaire — Module 4 B4 (mode='edit') + B5 (mode='create').
 *
 * Sections empilées (sans Accordion V1) :
 *   1. Identité (firstName/lastName/preferredName/gender + email en mode create)
 *   2. Contrat (type/contract/jobTitle/department/hireDate)
 *   3. Fiscalité (taxResidence/isTaxResidentFrance/taxId)
 *   4. Adresse (4 champs + country)
 *   5. Banque (newIban + BIC + bank + holder)
 *
 * Différences mode='create' vs 'edit' :
 *   - Title : "Nouveau bénéficiaire" vs "Modifier {full_name}"
 *   - Email : éditable en create, read-only en edit
 *   - Submit : 2 boutons en create ("Créer" + "Créer et inviter"),
 *              1 bouton en edit ("Enregistrer les modifications")
 *   - Initial values : tout vide en create, pré-rempli depuis bene en edit
 */
export function BeneficiaryFormModal({
  mode,
  open,
  onOpenChange,
  beneficiary,
  onSuccess,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required en mode='edit', ignoré en mode='create'. */
  beneficiary?: Beneficiary;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [complianceBlock, setComplianceBlock] = useState<ComplianceIssue[] | null>(null);

  // Form state — initialisé depuis le bene en mode edit, sinon vide
  const initial = beneficiary;
  const [email, setEmail] = useState(initial?.email ?? '');
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [preferredName, setPreferredName] = useState(initial?.preferred_name ?? '');
  const [gender, setGender] = useState<string>(initial?.gender ?? '');
  const [beneficiaryType, setBeneficiaryType] = useState<string>(
    initial?.beneficiary_type ?? 'EMPLOYEE',
  );
  const [contractType, setContractType] = useState<string>(initial?.contract_type ?? '');
  const [jobTitle, setJobTitle] = useState(initial?.job_title ?? '');
  const [department, setDepartment] = useState(initial?.department ?? '');
  const [hireDate, setHireDate] = useState(initial?.hire_date ?? '');
  const [taxResidence, setTaxResidence] = useState(initial?.tax_residence_country ?? 'FR');
  const [isTaxResidentFrance, setIsTaxResidentFrance] = useState(
    initial?.is_tax_resident_france ?? true,
  );
  const [taxId, setTaxId] = useState(initial?.tax_id ?? '');
  const [addressLine1, setAddressLine1] = useState(initial?.address_line_1 ?? '');
  const [addressLine2, setAddressLine2] = useState(initial?.address_line_2 ?? '');
  const [postalCode, setPostalCode] = useState(initial?.postal_code ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [country, setCountry] = useState(initial?.country ?? 'FR');
  const [bic, setBic] = useState(initial?.bic ?? '');
  const [bankName, setBankName] = useState(initial?.bank_name ?? '');
  const [bankHolder, setBankHolder] = useState(initial?.bank_account_holder_name ?? '');
  const [newIban, setNewIban] = useState('');

  function buildPayload(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      preferredName: preferredName.trim() || undefined,
      gender: gender || null,
      beneficiaryType,
      contractType: contractType || undefined,
      jobTitle: jobTitle.trim() || undefined,
      department: department.trim() || undefined,
      hireDate: hireDate || undefined,
      taxResidence,
      isTaxResidentFrance,
      taxId: taxId.trim() || undefined,
      addressLine1: addressLine1.trim() || undefined,
      addressLine2: addressLine2.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      city: city.trim() || undefined,
      country,
      bic: bic.trim() || undefined,
      bankName: bankName.trim() || undefined,
      bankAccountHolderName: bankHolder.trim() || undefined,
    };
    if (newIban.trim().length > 0) base.iban = newIban.trim();
    return base;
  }

  function handleSubmit(alsoInvite = false) {
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createBeneficiary({ email: email.trim(), ...buildPayload() });
        if (!res.ok) {
          if (res.complianceIssues && res.complianceIssues.length > 0) {
            setComplianceBlock(res.complianceIssues);
            toast.error(`Conformité : ${res.complianceIssues.length} erreur(s) bloquante(s)`);
          } else {
            toast.error(res.error);
          }
          return;
        }

        toast.success('Bénéficiaire créé');

        if (alsoInvite) {
          const inv = await inviteBeneficiary({ beneficiaryId: res.id });
          if (inv.ok) {
            toast.success('Magic link envoyé');
          } else {
            toast.error(`Bénéficiaire créé mais invitation échouée : ${inv.error}`);
          }
        }

        onOpenChange(false);
        onSuccess();
      } else {
        // mode === 'edit'
        if (!beneficiary) return;
        const res = await updateBeneficiary({
          beneficiaryId: beneficiary.id,
          patch: buildPayload(),
        });
        if (res.ok) {
          toast.success('Bénéficiaire mis à jour');
          onOpenChange(false);
          onSuccess();
        } else if (res.complianceIssues && res.complianceIssues.length > 0) {
          setComplianceBlock(res.complianceIssues);
          toast.error(`Conformité : ${res.complianceIssues.length} erreur(s) bloquante(s)`);
        } else {
          toast.error(res.error);
        }
      }
    });
  }

  const canSubmit =
    !pending &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    (mode === 'edit' || email.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? 'Nouveau bénéficiaire'
              : `Modifier ${beneficiary?.first_name ?? ''} ${beneficiary?.last_name ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? "Création d'un bénéficiaire dans cette organisation. L'email sera utilisé pour le magic link au portail."
              : `Email ${beneficiary?.email ?? ''} non modifiable en V1.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Section title="Identité">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email *" htmlFor="bf-email">
                <Input
                  id="bf-email"
                  type="email"
                  value={email}
                  readOnly={mode === 'edit'}
                  disabled={mode === 'edit'}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@entreprise.com"
                  data-testid="bf-email"
                />
              </Field>
              <Field label="Genre" htmlFor="bf-gender">
                <select
                  id="bf-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">— non défini —</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                  <option value="X">Non spécifié</option>
                </select>
              </Field>
              <Field label="Prénom *" htmlFor="bf-first">
                <Input
                  id="bf-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  data-testid="bf-first"
                />
              </Field>
              <Field label="Nom *" htmlFor="bf-last">
                <Input
                  id="bf-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  data-testid="bf-last"
                />
              </Field>
              <Field label="Préféré" htmlFor="bf-preferred">
                <Input
                  id="bf-preferred"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Contrat">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type de bénéficiaire *" htmlFor="bf-type">
                <select
                  id="bf-type"
                  value={beneficiaryType}
                  onChange={(e) => setBeneficiaryType(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  {BENE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type de contrat" htmlFor="bf-contract">
                <select
                  id="bf-contract"
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">— non défini —</option>
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Poste" htmlFor="bf-job">
                <Input id="bf-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </Field>
              <Field label="Département" htmlFor="bf-dept">
                <Input
                  id="bf-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </Field>
              <Field label="Date d'embauche" htmlFor="bf-hire">
                <Input
                  id="bf-hire"
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Fiscalité">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Résidence (ISO 2 lettres)" htmlFor="bf-tax">
                <Input
                  id="bf-tax"
                  maxLength={2}
                  value={taxResidence}
                  onChange={(e) => setTaxResidence(e.target.value.toUpperCase())}
                  placeholder="FR"
                />
              </Field>
              <Field label="Résident France" htmlFor="bf-isfr">
                <select
                  id="bf-isfr"
                  value={isTaxResidentFrance ? 'yes' : 'no'}
                  onChange={(e) => setIsTaxResidentFrance(e.target.value === 'yes')}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="yes">Oui</option>
                  <option value="no">Non</option>
                </select>
              </Field>
              <Field label="Numéro fiscal" htmlFor="bf-taxid">
                <Input id="bf-taxid" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Adresse">
            <div className="grid gap-3">
              <Field label="Ligne 1" htmlFor="bf-addr1">
                <Input
                  id="bf-addr1"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                />
              </Field>
              <Field label="Ligne 2" htmlFor="bf-addr2">
                <Input
                  id="bf-addr2"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Code postal" htmlFor="bf-postal">
                  <Input
                    id="bf-postal"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </Field>
                <Field label="Ville" htmlFor="bf-city">
                  <Input id="bf-city" value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="Pays (ISO)" htmlFor="bf-country">
                  <Input
                    id="bf-country"
                    maxLength={2}
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Banque">
            {mode === 'edit' && beneficiary?.iban_masked ? (
              <div className="bg-muted/30 mb-3 rounded-md border p-2 text-xs">
                IBAN actuel masqué : <span className="font-mono">{beneficiary.iban_masked}</span>.
                Saisir un nouveau IBAN pour le remplacer (vide = inchangé).
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={mode === 'edit' ? 'Nouveau IBAN (optionnel)' : 'IBAN (optionnel)'}
                htmlFor="bf-iban"
              >
                <Input
                  id="bf-iban"
                  value={newIban}
                  onChange={(e) => setNewIban(e.target.value)}
                  placeholder="FR76..."
                />
              </Field>
              <Field label="BIC" htmlFor="bf-bic">
                <Input id="bf-bic" value={bic} onChange={(e) => setBic(e.target.value)} />
              </Field>
              <Field label="Banque" htmlFor="bf-bankname">
                <Input
                  id="bf-bankname"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </Field>
              <Field label="Titulaire du compte" htmlFor="bf-bankholder">
                <Input
                  id="bf-bankholder"
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value)}
                />
              </Field>
            </div>
          </Section>
        </div>

        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          {mode === 'create' ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleSubmit(false)}
                disabled={!canSubmit}
                data-testid="bf-create"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : 'Créer'}
              </Button>
              <Button
                onClick={() => handleSubmit(true)}
                disabled={!canSubmit}
                data-testid="bf-create-and-invite"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : 'Créer et inviter'}
              </Button>
            </div>
          ) : (
            <Button onClick={() => handleSubmit(false)} disabled={!canSubmit} data-testid="bf-save">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Enregistrer les modifications'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <ComplianceIssuesDialog
        open={complianceBlock != null}
        onOpenChange={(o) => !o && setComplianceBlock(null)}
        issues={complianceBlock ?? []}
        title={
          mode === 'create'
            ? 'Création bloquée par la conformité'
            : 'Modification bloquée par la conformité'
        }
      />
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
