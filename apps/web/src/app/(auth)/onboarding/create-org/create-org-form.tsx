'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { createOrganization } from '@/server/actions/organizations';

const LEGAL_FORMS = ['SAS', 'SA', 'SARL', 'SCA', 'SC', 'EURL', 'OTHER'] as const;

/**
 * Onboarding flow — création de la première organisation.
 *
 * Module 2 §2.4 : un utilisateur authentifié sans aucune membership atterrit
 * ici (le proxy.ts redirige). Le submit appelle `createOrganization` qui
 * bootstrappe l'org + le membership OWNER + l'app_metadata.active_org_id,
 * puis on force un refresh de session côté client pour que le nouveau JWT
 * soit pris en compte avant de naviguer vers /dashboard.
 */
export function CreateOrgForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setErrors({});
    const input = {
      name: String(formData.get('name') ?? '').trim(),
      legalName: (String(formData.get('legalName') ?? '').trim() || undefined) as
        | string
        | undefined,
      legalForm: (formData.get('legalForm') as string) || undefined,
      siren: (String(formData.get('siren') ?? '').trim() || undefined) as string | undefined,
    };

    startTransition(async () => {
      const result = await createOrganization(input as Parameters<typeof createOrganization>[0]);
      if (!result.success) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
        return;
      }
      // Force le client à recharger un JWT contenant le nouveau active_org_id
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      toast.success('Organisation créée');
      router.replace('/dashboard');
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Créer votre organisation</CardTitle>
        <CardDescription>
          Quelques informations pour démarrer. Vous pourrez les modifier plus tard depuis les
          paramètres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4" data-testid="create-org-form">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom de l’organisation *</Label>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="Capiwise"
              aria-invalid={!!errors.name}
            />
            {errors.name?.[0] ? <p className="text-destructive text-xs">{errors.name[0]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legalName">Raison sociale</Label>
            <Input
              id="legalName"
              name="legalName"
              maxLength={200}
              placeholder="Capiwise SAS"
              aria-invalid={!!errors.legalName}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legalForm">Forme juridique</Label>
            <select
              id="legalForm"
              name="legalForm"
              className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
              defaultValue=""
            >
              <option value="">— optionnel —</option>
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
              placeholder="123456789"
              pattern="\d{9}"
              aria-invalid={!!errors.siren}
            />
            {errors.siren?.[0] ? (
              <p className="text-destructive text-xs">{errors.siren[0]}</p>
            ) : (
              <p className="text-muted-foreground text-xs">9 chiffres, optionnel en V1.</p>
            )}
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Création…' : 'Créer mon organisation'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
