'use client';

import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    startTransition(async () => {
      const result = await setActiveOrg({ orgId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Force refresh du JWT côté client pour matcher le nouveau active_org_id
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      router.replace('/dashboard');
      router.refresh();
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
