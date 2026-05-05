import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { AcceptInviteAction } from './accept-invite-action';
import { RequestResendAction } from './request-resend-action';

export const metadata: Metadata = {
  title: 'Accepter une invitation',
};

type SearchParams = Promise<{ token?: string }>;

export default async function AcceptInvitePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = (params.token ?? '').trim();

  if (!token) {
    return <InvalidInvitationCard reason="Lien invalide — aucun token fourni." />;
  }

  // RPC publique, callable par anon (cf. migration 00010)
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc('get_invitation_by_token', { p_token: token });

  const invite = data?.[0];
  if (error || !invite) {
    return (
      <InvalidInvitationCard
        reason="Cette invitation est invalide, expirée ou déjà utilisée."
        token={token}
      />
    );
  }
  const isBeneficiary = invite.is_for_beneficiary ?? false;
  const expiresAt = new Date(invite.expires_at as string);
  const expiresAtHuman = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(expiresAt);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          {isBeneficiary
            ? `${invite.org_name} vous a attribué des instruments`
            : `Rejoindre ${invite.org_name}`}
        </CardTitle>
        <CardDescription>
          {invite.invited_by_email ? (
            <>
              <strong>{invite.invited_by_email}</strong> vous invite sur{' '}
              <strong>{invite.org_name}</strong> avec les rôles suivants :
            </>
          ) : (
            <>
              Vous êtes invité sur <strong>{invite.org_name}</strong> avec les rôles suivants :
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(invite.roles ?? []).map((r: string) => (
            <Badge key={r} variant="secondary">
              {ROLE_LABELS[r as Role] ?? r}
            </Badge>
          ))}
        </div>

        {invite.message ? (
          <blockquote className="border-muted-foreground/20 text-muted-foreground border-l-4 pl-3 text-sm italic">
            « {invite.message} »
          </blockquote>
        ) : null}

        <div className="text-muted-foreground rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900/40">
          Email invité : <strong className="text-foreground">{invite.email}</strong>
          <br />
          Expire le <strong className="text-foreground">{expiresAtHuman}</strong>
        </div>

        <AcceptInviteAction token={token} />
      </CardContent>
    </Card>
  );
}

function InvalidInvitationCard({ reason, token }: { reason: string; token?: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="text-destructive size-5" />
          Invitation invalide
        </CardTitle>
        <CardDescription>{reason}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {token ? (
          <>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Vous pouvez demander à l’expéditeur original de vous renvoyer une nouvelle invitation.
              Nous lui ferons suivre votre demande automatiquement.
            </p>
            <RequestResendAction token={token} />
          </>
        ) : null}
        <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          Retour à la connexion
        </Link>
      </CardContent>
    </Card>
  );
}
