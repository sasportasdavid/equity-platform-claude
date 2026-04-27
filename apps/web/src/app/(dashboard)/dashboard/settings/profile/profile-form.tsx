'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateMyProfile } from '@/server/actions/profile';

export function ProfileForm({
  initialFullName,
  initialPhone,
}: {
  initialFullName: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setErrors({});
    const fullName = String(formData.get('fullName') ?? '').trim() || undefined;
    const phone = String(formData.get('phone') ?? '').trim() || undefined;

    startTransition(async () => {
      const result = await updateMyProfile({ fullName, phone });
      if (!result.success) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
        return;
      }
      toast.success('Profil mis à jour');
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4" data-testid="profile-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nom complet</Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={initialFullName}
            placeholder="Jean Dupont"
            maxLength={120}
            aria-invalid={!!errors.fullName}
          />
          {errors.fullName?.[0] ? (
            <p className="text-destructive text-xs">{errors.fullName[0]}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialPhone}
            placeholder="+33 6 12 34 56 78"
            maxLength={30}
            aria-invalid={!!errors.phone}
          />
          {errors.phone?.[0] ? <p className="text-destructive text-xs">{errors.phone[0]}</p> : null}
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
