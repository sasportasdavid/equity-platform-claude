'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ROLE_TITLES, ROLE_TITLE_LABELS, type RoleTitle } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TitleRule } from '@/components/shared/title-rule';
import { updateOnboardingProfile } from '@/server/actions/onboarding';

type Props = {
  initialFirstName: string;
  initialLastName: string;
  initialRoleTitle: RoleTitle | null;
};

/**
 * Module 14 §B2 wizard étape 1 — capture prénom/nom/rôle.
 *
 * UX éditoriale DS V1 :
 *   - Hero "Faisons connaissance." en italic Fraunces (`serif-italic`)
 *   - TitleRule cuivre 64px sous le hero
 *   - Card shadcn avec form contrôlé
 *
 * Submit appelle `updateOnboardingProfile` puis navigue vers
 * `/onboarding/company` (étape 2).
 */
export function ProfileForm({ initialFirstName, initialLastName, initialRoleTitle }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setErrors({});
    const firstName = String(formData.get('firstName') ?? '').trim();
    const lastName = String(formData.get('lastName') ?? '').trim();
    const roleTitle = String(formData.get('roleTitle') ?? '') as RoleTitle;

    startTransition(async () => {
      const result = await updateOnboardingProfile({ firstName, lastName, roleTitle });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
        return;
      }
      router.replace('/onboarding/company');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          <span className="serif-italic text-brass-500">Faisons connaissance.</span>
        </CardTitle>
        <TitleRule />
        <CardDescription className="pt-1">
          Quelques informations sur vous pour personnaliser votre expérience. Vous pourrez les
          modifier plus tard depuis votre profil.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4" data-testid="onboarding-profile-form">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                name="firstName"
                required
                defaultValue={initialFirstName}
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                data-testid="onboarding-firstname"
              />
              {errors.firstName?.[0] ? (
                <p className="text-destructive text-xs">{errors.firstName[0]}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                name="lastName"
                required
                defaultValue={initialLastName}
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                data-testid="onboarding-lastname"
              />
              {errors.lastName?.[0] ? (
                <p className="text-destructive text-xs">{errors.lastName[0]}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roleTitle">Votre rôle</Label>
            <select
              id="roleTitle"
              name="roleTitle"
              required
              defaultValue={initialRoleTitle ?? ''}
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
              aria-invalid={!!errors.roleTitle}
              data-testid="onboarding-role-title"
            >
              <option value="" disabled>
                — Sélectionnez votre rôle —
              </option>
              {ROLE_TITLES.map((rt) => (
                <option key={rt} value={rt}>
                  {ROLE_TITLE_LABELS[rt]}
                </option>
              ))}
            </select>
            {errors.roleTitle?.[0] ? (
              <p className="text-destructive text-xs">{errors.roleTitle[0]}</p>
            ) : null}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={pending}
              className="gap-1"
              data-testid="onboarding-profile-submit"
            >
              {pending ? 'Enregistrement…' : 'Continuer →'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
