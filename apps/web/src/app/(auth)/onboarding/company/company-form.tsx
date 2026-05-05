'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Building2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TitleRule } from '@/components/shared/title-rule';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { acceptInvitation } from '@/server/actions/invitations';
import { createOrganization } from '@/server/actions/organizations';

const LEGAL_FORMS = ['SAS', 'SA', 'SARL', 'SCA', 'SC', 'EURL', 'OTHER'] as const;
type Mode = 'create' | 'join';

/**
 * Module 14 §B2 wizard étape 2 — choix Rejoindre / Créer une org.
 *
 * - Mode `join` : input "code d'invitation" (token 64 hex). Soumission
 *   appelle `acceptInvitation` Server Action. Si succès, on rafraîchit
 *   la session puis on navigue vers `/onboarding/welcome` (la membership
 *   ACTIVE crée par accept fait que `/onboarding` détectera `hasOrg`
 *   et continue le flow).
 * - Mode `create` : form classique nom + raison sociale + forme juridique
 *   + SIREN (Module 2 §2.4 existant `createOrganization`).
 *
 * Pourquoi pas une discriminated union côté Server Action : on REUSE les
 * 2 actions existantes (`acceptInvitation`, `createOrganization`) sans
 * créer un wrapper pour ne pas dupliquer leur logique audit/RPC.
 */
export function CompanyForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('create');
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setErrors({});
    setGlobalError(null);

    if (mode === 'join') {
      const token = String(formData.get('invitationToken') ?? '').trim();
      if (token.length < 32) {
        setErrors({ invitationToken: ['Code d’invitation invalide.'] });
        return;
      }
      startTransition(async () => {
        const result = await acceptInvitation({ token });
        if (!result.success) {
          setGlobalError(result.error);
          return;
        }
        // `acceptInvitation` retourne un magic link auto-login. Pour le
        // wizard onboarding, on est DÉJÀ authentifié (le user a fait son
        // profile à l'étape 1) — on n'a pas besoin de re-login. La
        // membership a été créée via upsert, on rafraîchit juste la
        // session pour récupérer le nouveau active_org_id et on continue
        // vers welcome.
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.refreshSession();
        toast.success('Vous avez rejoint l’organisation');
        router.replace('/onboarding/welcome');
        router.refresh();
      });
      return;
    }

    // Mode create
    const input = {
      name: String(formData.get('name') ?? '').trim(),
      legalName: String(formData.get('legalName') ?? '').trim() || undefined,
      legalForm: (formData.get('legalForm') as string) || undefined,
      siren: String(formData.get('siren') ?? '').trim() || undefined,
    };
    startTransition(async () => {
      const result = await createOrganization(input as Parameters<typeof createOrganization>[0]);
      if (!result.success) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        setGlobalError(result.error);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      toast.success('Organisation créée');
      router.replace('/onboarding/welcome');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          <span className="serif-italic text-brass-500">Parlons de votre entreprise.</span>
        </CardTitle>
        <TitleRule />
        <CardDescription className="pt-1">
          Vous rejoignez une organisation existante grâce à un code reçu par email, ou vous créez la
          vôtre maintenant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {globalError ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive mb-4 rounded-md border px-3 py-2 text-xs"
            data-testid="onboarding-company-global-error"
          >
            {globalError}
          </div>
        ) : null}
        <div
          role="radiogroup"
          aria-label="Type d’organisation"
          className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          <ModeChoice
            mode="create"
            currentMode={mode}
            onClick={() => setMode('create')}
            icon={<Building2 className="size-4" />}
            label="Créer une nouvelle organisation"
            description="Vous démarrez Capiwise pour une société."
            testId="onboarding-mode-create"
          />
          <ModeChoice
            mode="join"
            currentMode={mode}
            onClick={() => setMode('join')}
            icon={<Mail className="size-4" />}
            label="Rejoindre via un code"
            description="Vous avez reçu une invitation par email."
            testId="onboarding-mode-join"
          />
        </div>

        <form
          action={onSubmit}
          key={mode}
          className="space-y-4"
          data-testid="onboarding-company-form"
        >
          {mode === 'join' ? (
            <div className="space-y-1.5">
              <Label htmlFor="invitationToken">Code d’invitation</Label>
              <Input
                id="invitationToken"
                name="invitationToken"
                required
                placeholder="64 caractères reçus par email"
                aria-invalid={!!errors.invitationToken}
                data-testid="onboarding-invitation-token"
              />
              {errors.invitationToken?.[0] ? (
                <p className="text-destructive text-xs">{errors.invitationToken[0]}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Vous trouverez ce code dans l’email d’invitation envoyé par votre administrateur.
                </p>
              )}
            </div>
          ) : (
            <>
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
                  data-testid="onboarding-org-name"
                />
                {errors.name?.[0] ? (
                  <p className="text-destructive text-xs">{errors.name[0]}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legalName">Raison sociale</Label>
                <Input
                  id="legalName"
                  name="legalName"
                  maxLength={200}
                  placeholder="Capiwise SAS"
                  aria-invalid={!!errors.legalName}
                  data-testid="onboarding-org-legal-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="legalForm">Forme juridique</Label>
                  <select
                    id="legalForm"
                    name="legalForm"
                    className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                    defaultValue=""
                    data-testid="onboarding-org-legal-form"
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
                    data-testid="onboarding-org-siren"
                  />
                  {errors.siren?.[0] ? (
                    <p className="text-destructive text-xs">{errors.siren[0]}</p>
                  ) : (
                    <p className="text-muted-foreground text-xs">9 chiffres, optionnel.</p>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.replace('/onboarding/profile')}
              data-testid="onboarding-company-back"
            >
              ← Précédent
            </Button>
            <Button type="submit" disabled={pending} data-testid="onboarding-company-submit">
              {pending ? 'Enregistrement…' : 'Continuer →'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ModeChoice({
  mode,
  currentMode,
  onClick,
  icon,
  label,
  description,
  testId,
}: {
  mode: Mode;
  currentMode: Mode;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  testId: string;
}) {
  const selected = mode === currentMode;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-testid={testId}
      className={`rounded-md border p-3 text-left transition ${
        selected
          ? 'border-brass-500 bg-brass-50/40 dark:bg-brass-500/5'
          : 'border-input hover:bg-muted/40'
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-brass-500">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </button>
  );
}
