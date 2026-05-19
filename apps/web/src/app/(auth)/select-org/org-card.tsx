'use client';

import { useTransition } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS, type Role } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { setActiveOrg } from '@/server/actions/auth';

export function OrgCard({
  orgId,
  name,
  slug,
  roles,
  isActive,
}: {
  orgId: string;
  name: string;
  slug: string | null;
  roles: string[];
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    startTransition(async () => {
      const result = await setActiveOrg({ orgId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Force refresh du JWT côté client pour matcher le nouveau active_org_id.
      // Le `custom_access_token_hook` doit re-fire pour injecter le claim
      // depuis le default_org_id qu'on vient d'écrire en DB.
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      // **Bug "boucle profile switch" (fix 2026-05-19)** : `router.replace`
      // + `router.refresh` envoient parfois la requête /dashboard avec le
      // cookie auth-token PRÉCÉDENT (race entre l'écriture du nouveau JWT
      // par refreshSession et l'attachement aux requêtes Next). Résultat :
      // le proxy lit l'ancien JWT (sans active_org_id) → redirect vers
      // /select-org → boucle. Hard reload garantit que le navigateur
      // utilise le cookie fraîchement écrit pour la requête /dashboard.
      window.location.href = '/dashboard';
    });
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={`cursor-pointer transition-shadow hover:shadow-md ${
        pending ? 'pointer-events-none opacity-60' : ''
      } ${isActive ? 'ring-primary ring-2' : ''}`}
      data-testid="org-card"
      data-org-id={orgId}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="truncate">{name}</span>
          {isActive ? <Check className="text-primary size-4 shrink-0" /> : null}
        </CardTitle>
        {slug ? <CardDescription className="font-mono text-[11px]">{slug}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1">
          {roles.length > 0 ? (
            roles.map((r) => (
              <Badge key={r} variant="secondary" className="font-normal">
                {ROLE_LABELS[r as Role] ?? r}
              </Badge>
            ))
          ) : (
            <Badge variant="outline">Aucun rôle</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
