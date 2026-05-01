'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  completeBeneficiaryProfileSchema,
  type CompleteBeneficiaryProfileInput,
} from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { completeBeneficiaryProfile } from '@/server/actions/portal';
import { PORTAL_COUNTRIES, getPortalCountryName } from './countries';

/**
 * Module 8 — Form ProfileSetup (étape 2 onboarding).
 *
 * RHF + Zod resolver. Submit appelle Server Action
 * `completeBeneficiaryProfile()`.
 *
 * Bouton "Plus tard" → /portal/awards SANS sauvegarder.
 *
 * tax_residence_country : affichage info-only (read-only) — bloqué par
 * trigger Module 4 V1.
 */
export function ProfileSetupForm({
  initialFirstName,
  initialLastName,
  initialAddressLine1,
  initialAddressLine2,
  initialPostalCode,
  initialCity,
  initialCountry,
  taxResidenceCountry,
}: {
  initialFirstName: string;
  initialLastName: string;
  initialAddressLine1: string;
  initialAddressLine2: string;
  initialPostalCode: string;
  initialCity: string;
  initialCountry: string;
  taxResidenceCountry: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<CompleteBeneficiaryProfileInput>({
    resolver: zodResolver(completeBeneficiaryProfileSchema),
    defaultValues: {
      firstName: initialFirstName,
      lastName: initialLastName,
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
      const res = await completeBeneficiaryProfile(data);
      if (res.ok) {
        toast.success('Profil enregistré');
        router.push('/portal/awards');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  });

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="space-y-6" data-testid="profile-setup-form">
          {/* Identité */}
          <section className="space-y-4">
            <h2 className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
              Identité
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Prénom *"
                htmlFor="ps-first"
                error={form.formState.errors.firstName?.message}
              >
                <Input id="ps-first" autoComplete="given-name" {...form.register('firstName')} />
              </Field>
              <Field
                label="Nom *"
                htmlFor="ps-last"
                error={form.formState.errors.lastName?.message}
              >
                <Input id="ps-last" autoComplete="family-name" {...form.register('lastName')} />
              </Field>
            </div>
            <Field
              label="Téléphone"
              htmlFor="ps-phone"
              error={form.formState.errors.phone?.message}
              hint="Optionnel · format international (+33…)"
            >
              <Input
                id="ps-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+33 6 12 34 56 78"
                {...form.register('phone')}
              />
            </Field>
          </section>

          {/* Adresse */}
          <section className="space-y-4">
            <h2 className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
              Adresse postale
            </h2>
            <Field
              label="Adresse *"
              htmlFor="ps-addr1"
              error={form.formState.errors.addressLine1?.message}
            >
              <Input
                id="ps-addr1"
                autoComplete="address-line1"
                {...form.register('addressLine1')}
              />
            </Field>
            <Field
              label="Complément d'adresse"
              htmlFor="ps-addr2"
              error={form.formState.errors.addressLine2?.message}
            >
              <Input
                id="ps-addr2"
                autoComplete="address-line2"
                {...form.register('addressLine2')}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label="Code postal *"
                htmlFor="ps-postal"
                error={form.formState.errors.postalCode?.message}
              >
                <Input id="ps-postal" autoComplete="postal-code" {...form.register('postalCode')} />
              </Field>
              <Field label="Ville *" htmlFor="ps-city" error={form.formState.errors.city?.message}>
                <Input id="ps-city" autoComplete="address-level2" {...form.register('city')} />
              </Field>
              <Field
                label="Pays *"
                htmlFor="ps-country"
                error={form.formState.errors.country?.message}
              >
                <select
                  id="ps-country"
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
          </section>

          {/* Tax residence (read-only V1) */}
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
              Résidence fiscale
            </h2>
            <div className="bg-muted/40 border-border/40 flex items-center justify-between gap-4 rounded-md border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{getPortalCountryName(taxResidenceCountry)}</p>
                <p className="text-muted-foreground text-xs">
                  Si vous souhaitez modifier votre pays de résidence fiscale, contactez votre RH.
                </p>
              </div>
              <span className="text-muted-foreground bg-background rounded-full px-2 py-0.5 font-mono text-[10px]">
                {taxResidenceCountry}
              </span>
            </div>
          </section>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/portal/awards')}
              disabled={pending}
              data-testid="profile-setup-skip"
            >
              Plus tard
            </Button>
            <Button type="submit" disabled={pending} data-testid="profile-setup-submit">
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                'Enregistrer et continuer'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
