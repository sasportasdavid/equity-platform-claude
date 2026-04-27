'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createInvitation } from '@/server/actions/invitations';

export function InviteMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(['ADMIN_HR']);

  function toggleRole(role: Role, checked: boolean) {
    setSelectedRoles((prev) =>
      checked ? Array.from(new Set([...prev, role])) : prev.filter((r) => r !== role),
    );
  }

  function onSubmit(formData: FormData) {
    setErrors({});
    if (selectedRoles.length === 0) {
      setErrors({ roles: ['Sélectionnez au moins un rôle'] });
      return;
    }

    const input = {
      email: String(formData.get('email') ?? '').trim(),
      roles: selectedRoles,
      message: (String(formData.get('message') ?? '').trim() || undefined) as string | undefined,
    };

    startTransition(async () => {
      const result = await createInvitation(input);
      if (!result.success) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
        return;
      }
      toast.success(`Invitation envoyée à ${result.email}`);
      setOpen(false);
      setSelectedRoles(['ADMIN_HR']);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button data-testid="invite-member-trigger">
            <UserPlus className="size-4" />
            Inviter un membre
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter un membre</DialogTitle>
          <DialogDescription>
            La personne reçoit un email avec un lien d’invitation valide 7 jours. Si elle accepte,
            son compte est créé automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4" data-testid="invite-member-form">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email *</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="collegue@entreprise.fr"
              aria-invalid={!!errors.email}
            />
            {errors.email?.[0] ? (
              <p className="text-destructive text-xs">{errors.email[0]}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Rôles *</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((role) => (
                <label
                  key={role}
                  className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm"
                >
                  <Checkbox
                    checked={selectedRoles.includes(role)}
                    onCheckedChange={(checked) => toggleRole(role, checked === true)}
                    className="mt-0.5"
                  />
                  <span>{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>
            {errors.roles?.[0] ? (
              <p className="text-destructive text-xs">{errors.roles[0]}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-message">Message (optionnel)</Label>
            <textarea
              id="invite-message"
              name="message"
              rows={3}
              maxLength={500}
              className="border-input bg-background focus-visible:ring-ring/50 shadow-xs focus-visible:ring-3 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Bienvenue dans l'équipe ! N'hésite pas à m'écrire si tu as des questions."
            />
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Annuler
                </Button>
              }
            />
            <Button type="submit" disabled={pending}>
              {pending ? 'Envoi…' : 'Envoyer l’invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
