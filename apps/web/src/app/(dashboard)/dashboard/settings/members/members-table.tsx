'use client';

import { MoreHorizontal, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { reactivateMember, removeMember, suspendMember } from '@/server/actions/members';
import type { MemberRow } from '@/server/queries/members';
import { DestructiveConfirm } from './destructive-confirm';
import { EditMemberRolesDialog } from './edit-member-roles-dialog';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  INVITED: 'secondary',
  SUSPENDED: 'destructive',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function MembersTable({
  members,
  currentUserId,
}: {
  members: MemberRow[];
  currentUserId: string;
}) {
  if (members.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed py-8 text-center text-sm">
        Aucun membre — invitez votre premier collaborateur ci-dessus.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table data-testid="members-table">
        <TableHeader>
          <TableRow>
            <TableHead>Membre</TableHead>
            <TableHead>Rôles</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="hidden md:table-cell">Rejoint le</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const isMe = m.user_id === currentUserId;
            return (
              <TableRow key={m.id}>
                <TableCell className="min-w-[180px]">
                  <div className="font-medium">{m.full_name ?? m.email}</div>
                  <div className="text-muted-foreground text-xs">
                    {m.email}
                    {isMe ? <span className="ml-2 italic">(vous)</span> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {m.roles.length === 0 ? (
                      <Badge variant="outline">aucun</Badge>
                    ) : (
                      m.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="font-normal">
                          {ROLE_LABELS[r as Role] ?? r}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_COLORS[m.status] ?? 'outline'} className="font-normal">
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                  {formatDate(m.accepted_at ?? m.created_at)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label="Actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <EditMemberRolesDialog
                        membershipId={m.id}
                        email={m.email}
                        currentRoles={m.roles as Role[]}
                        trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Pencil className="size-4" /> Modifier les rôles
                          </DropdownMenuItem>
                        }
                      />
                      {m.status === 'ACTIVE' ? (
                        <DestructiveConfirm
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <UserMinus className="size-4" /> Suspendre
                            </DropdownMenuItem>
                          }
                          title="Suspendre ce membre ?"
                          description={`${m.email} perdra immédiatement l'accès à l'organisation. Vous pourrez le réactiver à tout moment.`}
                          confirmLabel="Suspendre"
                          successMessage="Membre suspendu"
                          action={() => suspendMember({ membershipId: m.id })}
                        />
                      ) : (
                        <DestructiveConfirm
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <UserPlus className="size-4" /> Réactiver
                            </DropdownMenuItem>
                          }
                          title="Réactiver ce membre ?"
                          description={`${m.email} retrouvera l'accès à l'organisation avec ses rôles actuels.`}
                          confirmLabel="Réactiver"
                          successMessage="Membre réactivé"
                          action={() => reactivateMember({ membershipId: m.id })}
                        />
                      )}
                      <DropdownMenuSeparator />
                      <DestructiveConfirm
                        trigger={
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" /> Supprimer
                          </DropdownMenuItem>
                        }
                        title="Supprimer ce membre ?"
                        description={`${m.email} sera définitivement retiré de l'organisation. Action irréversible.`}
                        confirmLabel="Supprimer"
                        successMessage="Membre supprimé"
                        action={() => removeMember({ membershipId: m.id })}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
