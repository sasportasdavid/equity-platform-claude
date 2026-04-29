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
import { updateBeneficiary } from '@/server/actions/beneficiaries';
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
 * Modale Edit bénéficiaire — Module 4 B4.
 *
 * Form en sections (sans Accordion pour V1 — sections empilées avec
 * headers visibles, plus simple à scanner) :
 *   1. Identité (firstName/lastName/preferredName/gender)
 *   2. Contrat (type/contract/jobTitle/department)
 *   3. Fiscalité (taxResidence/isTaxResidentFrance/taxId)
 *   4. Adresse (4 champs + country)
 *   5. Banque (IBAN/BIC/bank/holder)
 *
 * Email read-only en V1 (sécurité — modif email = process séparé).
 *
 * Submit : updateBeneficiary Server Action. Si compliance hard block →
 * ComplianceIssuesDialog secondaire.
 */
export function EditBeneficiaryModal({
  open,
  onOpenChange,
  beneficiary,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beneficiary: Beneficiary;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [complianceBlock, setComplianceBlock] = useState<ComplianceIssue[] | null>(null);

  // Form state — initialisé depuis le bene
  const [firstName, setFirstName] = useState(beneficiary.first_name);
  const [lastName, setLastName] = useState(beneficiary.last_name);
  const [preferredName, setPreferredName] = useState(beneficiary.preferred_name ?? '');
  const [gender, setGender] = useState<string>(beneficiary.gender ?? '');
  const [beneficiaryType, setBeneficiaryType] = useState<string>(beneficiary.beneficiary_type);
  const [contractType, setContractType] = useState<string>(beneficiary.contract_type ?? '');
  const [jobTitle, setJobTitle] = useState(beneficiary.job_title ?? '');
  const [department, setDepartment] = useState(beneficiary.department ?? '');
  const [hireDate, setHireDate] = useState(beneficiary.hire_date ?? '');
  const [taxResidence, setTaxResidence] = useState(beneficiary.tax_residence_country);
  const [isTaxResidentFrance, setIsTaxResidentFrance] = useState(
    beneficiary.is_tax_resident_france ?? true,
  );
  const [taxId, setTaxId] = useState(beneficiary.tax_id ?? '');
  const [addressLine1, setAddressLine1] = useState(beneficiary.address_line_1 ?? '');
  const [addressLine2, setAddressLine2] = useState(beneficiary.address_line_2 ?? '');
  const [postalCode, setPostalCode] = useState(beneficiary.postal_code ?? '');
  const [city, setCity] = useState(beneficiary.city ?? '');
  const [country, setCountry] = useState(beneficiary.country ?? 'FR');
  const [bic, setBic] = useState(beneficiary.bic ?? '');
  const [bankName, setBankName] = useState(beneficiary.bank_name ?? '');
  const [bankHolder, setBankHolder] = useState(beneficiary.bank_account_holder_name ?? '');
  // IBAN : on n'expose pas le full (masked). Le user peut taper un nouveau IBAN
  // pour le remplacer, mais ne voit jamais l'ancien dans ce form V1.
  const [newIban, setNewIban] = useState('');

  function handleSubmit() {
    startTransition(async () => {
      const patch: Record<string, unknown> = {
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
      // Inclure newIban uniquement si saisi (sinon on ne touche pas à l'iban actuel)
      if (newIban.trim().length > 0) {
        patch.iban = newIban.trim();
      }

      const res = await updateBeneficiary({ beneficiaryId: beneficiary.id, patch });
      if (res.ok) {
        toast.success('Bénéficiaire mis à jour');
        onOpenChange(false);
        onSuccess();
      } else if (res.complianceIssues && res.complianceIssues.length > 0) {
        setComplianceBlock(res.complianceIssues);
        toast.error(
          `Validation conformité : ${res.complianceIssues.length} erreur(s) bloquante(s)`,
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Modifier {beneficiary.first_name} {beneficiary.last_name}
          </DialogTitle>
          <DialogDescription>
            Email <span className="font-mono">{beneficiary.email}</span> non modifiable en V1
            (modification réservée à un process séparé pour des raisons de sécurité auth).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Section title="Identité">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prénom *" htmlFor="ed-first">
                <Input
                  id="ed-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </Field>
              <Field label="Nom *" htmlFor="ed-last">
                <Input
                  id="ed-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </Field>
              <Field label="Préféré" htmlFor="ed-preferred">
                <Input
                  id="ed-preferred"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                />
              </Field>
              <Field label="Genre" htmlFor="ed-gender">
                <select
                  id="ed-gender"
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
            </div>
          </Section>

          <Section title="Contrat">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type de bénéficiaire *" htmlFor="ed-type">
                <select
                  id="ed-type"
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
              <Field label="Type de contrat" htmlFor="ed-contract">
                <select
                  id="ed-contract"
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
              <Field label="Poste" htmlFor="ed-job">
                <Input id="ed-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </Field>
              <Field label="Département" htmlFor="ed-dept">
                <Input
                  id="ed-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </Field>
              <Field label="Date d'embauche" htmlFor="ed-hire">
                <Input
                  id="ed-hire"
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Fiscalité">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Résidence (ISO 2 lettres)" htmlFor="ed-tax">
                <Input
                  id="ed-tax"
                  maxLength={2}
                  value={taxResidence}
                  onChange={(e) => setTaxResidence(e.target.value.toUpperCase())}
                  placeholder="FR"
                />
              </Field>
              <Field label="Résident France" htmlFor="ed-isfr">
                <select
                  id="ed-isfr"
                  value={isTaxResidentFrance ? 'yes' : 'no'}
                  onChange={(e) => setIsTaxResidentFrance(e.target.value === 'yes')}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="yes">Oui</option>
                  <option value="no">Non</option>
                </select>
              </Field>
              <Field label="Numéro fiscal" htmlFor="ed-taxid">
                <Input id="ed-taxid" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Adresse">
            <div className="grid gap-3">
              <Field label="Ligne 1" htmlFor="ed-addr1">
                <Input
                  id="ed-addr1"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                />
              </Field>
              <Field label="Ligne 2" htmlFor="ed-addr2">
                <Input
                  id="ed-addr2"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Code postal" htmlFor="ed-postal">
                  <Input
                    id="ed-postal"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </Field>
                <Field label="Ville" htmlFor="ed-city">
                  <Input id="ed-city" value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="Pays (ISO)" htmlFor="ed-country">
                  <Input
                    id="ed-country"
                    maxLength={2}
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Banque">
            <div className="bg-muted/30 mb-3 rounded-md border p-2 text-xs">
              IBAN actuel masqué :{' '}
              <span className="font-mono">{beneficiary.iban_masked ?? '—'}</span>. Saisir un nouveau
              IBAN pour le remplacer (ne touche pas l&apos;ancien si vide).
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nouveau IBAN (optionnel)" htmlFor="ed-iban">
                <Input
                  id="ed-iban"
                  value={newIban}
                  onChange={(e) => setNewIban(e.target.value)}
                  placeholder="FR76..."
                />
              </Field>
              <Field label="BIC" htmlFor="ed-bic">
                <Input id="ed-bic" value={bic} onChange={(e) => setBic(e.target.value)} />
              </Field>
              <Field label="Banque" htmlFor="ed-bankname">
                <Input
                  id="ed-bankname"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </Field>
              <Field label="Titulaire du compte" htmlFor="ed-bankholder">
                <Input
                  id="ed-bankholder"
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value)}
                />
              </Field>
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !firstName.trim() || !lastName.trim()}
            data-testid="edit-bene-save"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              'Enregistrer les modifications'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ComplianceIssuesDialog
        open={complianceBlock != null}
        onOpenChange={(o) => !o && setComplianceBlock(null)}
        issues={complianceBlock ?? []}
        title="Modification bloquée par la conformité"
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
