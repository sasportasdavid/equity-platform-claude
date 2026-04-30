'use client';

import { Label } from '@/components/ui/label';
import type { UserForApprover } from '@/server/queries/approvals';

/**
 * Module 5 B3 — Sélecteur USER ou ROLE selon le type d'approver.
 *
 * Switch entre 2 select natifs :
 *   - USER : select users actifs de l'org
 *   - ROLE / ANY_OF_ROLE / ALL_OF_ROLE : select rôles dispo
 */

export function ApproverSelectField({
  type,
  userId,
  role,
  onUserChange,
  onRoleChange,
  availableUsers,
  availableRoles,
}: {
  type: 'USER' | 'ROLE' | 'ANY_OF_ROLE' | 'ALL_OF_ROLE';
  userId?: string;
  role?: string;
  onUserChange: (userId: string | undefined) => void;
  onRoleChange: (role: string | undefined) => void;
  availableUsers: UserForApprover[];
  availableRoles: string[];
}) {
  if (type === 'USER') {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">Utilisateur *</Label>
        <select
          value={userId ?? ''}
          onChange={(e) => onUserChange(e.target.value || undefined)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="">— Sélectionner un utilisateur —</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name ? `${u.full_name} (${u.email})` : u.email}
            </option>
          ))}
        </select>
        {availableUsers.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            Aucun user actif dans l&apos;organisation. Inviter d&apos;abord.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Rôle *</Label>
      <select
        value={role ?? ''}
        onChange={(e) => onRoleChange(e.target.value || undefined)}
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
      >
        <option value="">— Sélectionner un rôle —</option>
        {availableRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}
