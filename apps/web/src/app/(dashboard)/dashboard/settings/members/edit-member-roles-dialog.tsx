'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ROLE_LABELS, ROLES, type Role } from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { updateMemberRoles } from '@/server/actions/members';

export function EditMemberRolesDialog({
  membershipId,
  email,
  currentRoles,
  trigger,
}: {
  membershipId: string;
  email: string;
  currentRoles: Role[];
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [roles, setRoles] = useState<Role[]>(currentRoles);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: Role, checked: boolean) {
    setRoles((prev) =>
      checked ? Array.from(new Set([...prev, role])) : prev.filter((r) => r !== role),
    );
  }

  function onSubmit() {
    setError(null);
    if (roles.length === 0) {
      setError('Sélectionnez au moins un rôle');
      return;
    }
    startTransition(async () => {
      const result = await updateMemberRoles({ membershipId, roles });
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Rôles mis à jour');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier les rôles</DialogTitle>
          <DialogDescription>
            Pour <strong className="text-foreground">{email}</strong>. Les changements prennent
            effet à la prochaine connexion de l’utilisateur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Rôles</Label>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((role) => (
              <label
                key={role}
                className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm"
              >
                <Checkbox
                  checked={roles.includes(role)}
                  onCheckedChange={(checked) => toggleRole(role, checked === true)}
                  className="mt-0.5"
                />
                <span>{ROLE_LABELS[role]}</span>
              </label>
            ))}
          </div>
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Annuler
              </Button>
            }
          />
          <Button type="button" disabled={pending} onClick={onSubmit}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
