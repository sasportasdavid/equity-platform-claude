'use client';

import { Trash2 } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { revokeInvitation } from '@/server/actions/invitations';
import type { InvitationRow } from '@/server/queries/members';
import { DestructiveConfirm } from './destructive-confirm';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function InvitationsTable({ invitations }: { invitations: InvitationRow[] }) {
  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed py-8 text-center text-sm">
        Aucune invitation en attente.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table data-testid="invitations-table">
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Rôles</TableHead>
            <TableHead className="hidden md:table-cell">Invité par</TableHead>
            <TableHead className="hidden md:table-cell">Expire le</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-medium">{inv.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {inv.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="font-normal">
                      {ROLE_LABELS[r as Role] ?? r}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                {inv.invited_by_email ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                {formatDate(inv.expires_at)}
              </TableCell>
              <TableCell>
                <DestructiveConfirm
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label="Révoquer">
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  }
                  title="Révoquer cette invitation ?"
                  description={`${inv.email} ne pourra plus rejoindre l'organisation avec ce lien. Une notification sera envoyée par email.`}
                  confirmLabel="Révoquer"
                  successMessage="Invitation révoquée"
                  action={() => revokeInvitation({ invitationId: inv.id })}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
