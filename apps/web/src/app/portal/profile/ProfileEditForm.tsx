'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { updateBeneficiaryProfileSchema, type UpdateBeneficiaryProfileInput } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { updateBeneficiaryProfile } from '@/server/actions/portal';
import { PORTAL_COUNTRIES, getPortalCountryName } from '../profile/setup/countries';

/**
 * Module 8 B5 — Formulaire édition profil bénéficiaire (§4.5).
 *
 * RHF + zodResolver(updateBeneficiaryProfileSchema). Submit appelle
 * `updateBeneficiaryProfile()` Server Action.
 *
 * Affichage en sections :
 *   1. Identité (read-only) : firstName, lastName, email
 *   2. Statut contractuel (read-only) : type, contract, hire_date
 *   3. Coordonnées (modifiables) : phone
 *   4. Adresse (modifiables) : address_line_1/2, postal_code, city, country
 *   5. Résidence fiscale (read-only) : tax_residence_country
 */
export function ProfileEditForm({
  firstName,
  lastName,
  email,
  taxResidenceCountry,
  beneficiaryType,
  contractType,
  hireDate,
  initialAddressLine1,
  initialAddressLine2,
  initialPostalCode,
  initialCity,
  initialCountry,
}: {
  firstName: string;
  lastName: string;
  email: string;
  taxResidenceCountry: string;
  beneficiaryType: string | null;
  contractType: string | null;
  hireDate: string | null;
  initialAddressLine1: string;
  initialAddressLine2: string;
  initialPostalCode: string;
  initialCity: string;
  initialCountry: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<UpdateBeneficiaryProfileInput>({
    resolver: zodResolver(updateBeneficiaryProfileSchema),
    defaultValues: {
      phone: '',
      addressLine1: initialAddressLine1,
      addressLine2: initialAddressLine2,
      postalCode: initialPostalCode,
      city: initialCity,
      country: initialCountry || 'FR',
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const res = await updateBeneficiaryProfile(data);
      if (res.ok) {
        toast.success('Profil mis à jour');
        // Reset phone field after submission (encrypted, can't read back)
        form.reset({ ...data, phone: '' });
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid="portal-profile-form">
      {/* Identité (read-only) */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Lock className="text-muted-foreground size-3.5" />
            <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Identité (non modifiable ici)
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Prénom" value={firstName} />
            <ReadOnlyField label="Nom" value={lastName} />
          </div>
          <ReadOnlyField label="Email" value={email} mono />
          {beneficiaryType || contractType || hireDate ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {beneficiaryType ? <ReadOnlyField label="Type" value={beneficiaryType} mono /> : null}
              {contractType ? <ReadOnlyField label="Contrat" value={contractType} mono /> : null}
              {hireDate ? (
                <ReadOnlyField label="Date d'embauche" value={formatLongDate(hireDate)} />
              ) : null}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Pour modifier votre identité, contactez votre RH.
          </p>
        </CardContent>
      </Card>

      {/* Coordonnées (phone) */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Coordonnées
          </h2>
          <Field
            label="Téléphone"
            htmlFor="pe-phone"
            error={form.formState.errors.phone?.message}
            hint="Laisser vide pour ne pas modifier · Format international (+33…)"
          >
            <Input
              id="pe-phone"
              type="tel"
              autoComplete="tel"
              placeholder="+33 6 12 34 56 78"
              {...form.register('phone')}
            />
          </Field>
          <p className="text-muted-foreground text-xs">
            Le téléphone est chiffré et n&apos;est jamais affiché ici en clair.
          </p>
        </CardContent>
      </Card>

      {/* Adresse */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Adresse postale
          </h2>
          <Field
            label="Adresse *"
            htmlFor="pe-addr1"
            error={form.formState.errors.addressLine1?.message}
          >
            <Input id="pe-addr1" autoComplete="address-line1" {...form.register('addressLine1')} />
          </Field>
          <Field
            label="Complément d'adresse"
            htmlFor="pe-addr2"
            error={form.formState.errors.addressLine2?.message}
          >
            <Input id="pe-addr2" autoComplete="address-line2" {...form.register('addressLine2')} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Code postal *"
              htmlFor="pe-postal"
              error={form.formState.errors.postalCode?.message}
            >
              <Input id="pe-postal" autoComplete="postal-code" {...form.register('postalCode')} />
            </Field>
            <Field label="Ville *" htmlFor="pe-city" error={form.formState.errors.city?.message}>
              <Input id="pe-city" autoComplete="address-level2" {...form.register('city')} />
            </Field>
            <Field
              label="Pays *"
              htmlFor="pe-country"
              error={form.formState.errors.country?.message}
            >
              <select
                id="pe-country"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1"
                {...form.register('country')}
              >
                {PORTAL_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Résidence fiscale (read-only) */}
      <Card>
        <CardContent className="space-y-2 p-6">
          <div className="flex items-center gap-2">
            <Lock className="text-muted-foreground size-3.5" />
            <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Résidence fiscale (non modifiable ici)
            </h2>
          </div>
          <div className="bg-muted/40 border-border/40 flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <div>
              <p className="text-sm font-medium">{getPortalCountryName(taxResidenceCountry)}</p>
              <p className="text-muted-foreground text-xs">
                Pour modifier votre pays de résidence fiscale, contactez votre RH.
              </p>
            </div>
            <span className="text-muted-foreground bg-background rounded-full px-2 py-0.5 font-mono text-[10px]">
              {taxResidenceCountry}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} data-testid="portal-profile-submit">
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Enregistrement…
            </>
          ) : (
            'Enregistrer les modifications'
          )}
        </Button>
      </div>
    </form>
  );
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('text-sm', mono && 'font-mono')}>{value}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  error,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

function formatLongDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const months = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ];
  const day = parseInt(iso.slice(8, 10), 10);
  const month = months[parseInt(iso.slice(5, 7), 10) - 1];
  const year = iso.slice(0, 4);
  return `${day} ${month} ${year}`;
}
