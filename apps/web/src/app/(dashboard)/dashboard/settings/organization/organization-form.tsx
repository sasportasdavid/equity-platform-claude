'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateOrganization } from '@/server/actions/organizations';

const LEGAL_FORMS = ['SAS', 'SA', 'SARL', 'SCA', 'SC', 'EURL', 'OTHER'] as const;
const TIMEZONES = ['Europe/Paris', 'Europe/London', 'America/New_York', 'UTC'] as const;
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;
const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

type Initial = {
  name: string;
  legalName: string;
  legalForm: string;
  siren: string;
  defaultCurrency: string;
  timezone: string;
  fiscalYearEndMonth: number;
};

export function OrganizationForm({ initial, canEdit }: { initial: Initial; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setErrors({});
    const input = {
      name: String(formData.get('name') ?? '').trim() || undefined,
      legalName: String(formData.get('legalName') ?? '').trim() || undefined,
      legalForm: (String(formData.get('legalForm') ?? '') || undefined) as
        | (typeof LEGAL_FORMS)[number]
        | undefined,
      siren: String(formData.get('siren') ?? '').trim() || undefined,
      defaultCurrency: String(formData.get('defaultCurrency') ?? '').trim() || undefined,
      timezone: String(formData.get('timezone') ?? '').trim() || undefined,
      fiscalYearEndMonth: Number(formData.get('fiscalYearEndMonth')) || undefined,
    };

    startTransition(async () => {
      const result = await updateOrganization(input);
      if (!result.success) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
        return;
      }
      toast.success('Organisation mise à jour');
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-5" data-testid="organization-form">
      <fieldset disabled={!canEdit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              name="name"
              defaultValue={initial.name}
              minLength={2}
              maxLength={120}
              aria-invalid={!!errors.name}
            />
            {errors.name?.[0] ? <p className="text-destructive text-xs">{errors.name[0]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legalName">Raison sociale</Label>
            <Input
              id="legalName"
              name="legalName"
              defaultValue={initial.legalName}
              maxLength={200}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="legalForm">Forme juridique</Label>
            <select
              id="legalForm"
              name="legalForm"
              defaultValue={initial.legalForm}
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">— non renseigné —</option>
              {LEGAL_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="siren">SIREN</Label>
            <Input
              id="siren"
              name="siren"
              defaultValue={initial.siren}
              pattern="\d{9}"
              placeholder="123456789"
              aria-invalid={!!errors.siren}
            />
            {errors.siren?.[0] ? (
              <p className="text-destructive text-xs">{errors.siren[0]}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="defaultCurrency">Devise</Label>
            <select
              id="defaultCurrency"
              name="defaultCurrency"
              defaultValue={initial.defaultCurrency}
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Fuseau</Label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={initial.timezone}
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fiscalYearEndMonth">Clôture exercice</Label>
            <select
              id="fiscalYearEndMonth"
              name="fiscalYearEndMonth"
              defaultValue={String(initial.fiscalYearEndMonth)}
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
            >
              {MONTHS_FR.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            Lecture seule — la permission <code>org.update</code> est requise pour modifier ces
            informations.
          </p>
        )}
      </fieldset>
    </form>
  );
}
